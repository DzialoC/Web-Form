class SharePointService {
  /**
   * @param {string} parentListName - The parent list name
   * @param {string[]} childListNames - Array of child list names
   * @param {string} webUrl - The SharePoint site URL
   */
  constructor(parentListName, childListNames, webUrl) {
    this.parentListName = parentListName;
    this.childListNames = childListNames || [];
    this.webUrl = webUrl;

    // Optionally set a default webURL for all SPServices calls:
    // $().SPServices.defaults.webURL = this.webUrl;
    // Or pass it directly in each operation as shown below.
  }

  /**
   * High-level method to submit the entire form data, which includes:
   * - creating/updating the parent item
   * - upserting the child items (tables, signatures, etc.)
   * - adding attachments if present
   *
   * @param {Object} formData - The form data with field IDs as keys
   * @param {Array} formConfig - The form configuration array
   * @param {number} [existingItemId] - Optional ID if updating an existing item
   * @returns {Promise<number>} - The ID of the created/updated item
   */
  submitForm(formData, formConfig, existingItemId = null) {
    return new Promise((resolve, reject) => {
      // Process the form data into the expected format
      const processedData = this._processFormData(
        formData,
        formConfig,
        existingItemId
      );

      // 1) Find the parent object in processedData
      const parentObj = processedData.find(
        (item) => item.id === this.parentListName
      );
      if (!parentObj) {
        const errMsg = `Parent data not found in formData for list "${this.parentListName}"`;
        console.error(errMsg);
        reject(errMsg);
        return;
      }

      // Convert parent fields array -> key/value pairs
      const parentFieldValues = {};
      if (Array.isArray(parentObj.fields)) {
        parentObj.fields.forEach((f) => {
          parentFieldValues[f.name] = f.value;
        });
      }

      // 2) Create or update the parent item
      let parentPromise;
      if (parentObj.spItemId) {
        // Update existing parent item
        parentPromise = this.updateItem(
          this.parentListName,
          parentObj.spItemId,
          parentFieldValues
        ).then(() => parentObj.spItemId);
      } else {
        // Create new parent item
        parentPromise = this.createItem(this.parentListName, parentFieldValues);
      }

      let parentItemId;

      parentPromise
        .then((id) => {
          parentItemId = id;
          console.log(
            `Parent item ${
              parentObj.spItemId ? "updated" : "created"
            } with ID: ${id}`
          );

          // 3) Upsert child items for each child list in this.childListNames
          const childPromises = [];
          this.childListNames.forEach((childList) => {
            // Find processedData entry with id == childList
            const childObj = processedData.find(
              (item) => item.id === childList
            );
            if (!childObj) return; // Not all child lists must be present in the form

            // Depending on the "type", parse the rows for upsert
            // Example: if type === "table", childObj.tableConfig.data is an array of row objects
            if (childObj.type === "table" && childObj.tableConfig) {
              const rowData = childObj.tableConfig.data || [];
              childPromises.push(
                this.upsertChildItems(
                  childList,
                  this.parentListName,
                  parentItemId,
                  rowData
                )
              );
            } else if (
              childObj.type === "signature" &&
              Array.isArray(childObj.options)
            ) {
              // Suppose each "options" entry corresponds to a column
              // Convert array into a single-row object or multiple rows as needed
              // For simplicity, let's assume one single row for the signature
              const rowData = [{}];
              childObj.options.forEach((opt) => {
                rowData[0][opt.name] = opt.value;
              });
              // If there's an spItemId in childObj, you might track that too
              if (childObj.spItemId) {
                rowData[0].spItemId = childObj.spItemId;
              }
              childPromises.push(
                this.upsertChildItems(
                  childList,
                  this.parentListName,
                  parentItemId,
                  rowData
                )
              );
            }
            // Expand logic for other possible childObj types as you wish...
          });

          return Promise.all(childPromises);
        })
        .then(() => {
          console.log("All child items created/updated successfully (if any).");

          // 4) Check if there's an "attachments" object
          const attachmentObj = processedData.find(
            (item) => item.type === "attachments"
          );
          if (attachmentObj && Array.isArray(attachmentObj.files)) {
            // Attach each file to the parent item
            const attachPromises = [];
            attachmentObj.files.forEach((file) => {
              attachPromises.push(
                this.addAttachment(this.parentListName, parentItemId, file)
              );
            });
            return Promise.all(attachPromises);
          }
        })
        .then(() => {
          console.log("Attachments uploaded successfully (if any).");
          resolve(parentItemId);
        })
        .catch((err) => {
          console.error("submitForm error:", err);
          reject(err);
        });
    });
  }

  /**
   * Processes form data from the dynamic form configuration and prepares it for SharePoint submission
   * @private
   * @param {Object} formData - The submitted form data with field IDs as keys
   * @param {Array} formConfig - The form configuration array
   * @param {number} [existingItemId] - Optional ID if updating an existing item
   * @returns {Array} - Formatted data array ready for internal processing
   */
  _processFormData(formData, formConfig, existingItemId = null) {
    // Initialize the result array
    const result = [];

    // Create the parent item entry
    const parentFields = [];

    // Process all form sections
    formConfig.forEach((section) => {
      section.fields.forEach((field) => {
        // Skip fields that aren't in the submitted data
        if (formData[field.id] === undefined) return;

        // Add to parent fields array
        parentFields.push({
          name: field.id, // Using field.id as the SharePoint column name
          value: formData[field.id],
        });
      });
    });

    // Add the parent list entry
    result.push({
      id: this.parentListName,
      spItemId: existingItemId,
      fields: parentFields,
    });

    // Process child tables if present in formData
    Object.keys(formData).forEach((key) => {
      // Check if this is a child table (arrays with table- prefix)
      if (Array.isArray(formData[key]) && key.startsWith("table-")) {
        const childListName = key;
        const tableData = formData[key];

        // Add the child table entry
        result.push({
          id: childListName,
          type: "table",
          tableConfig: {
            data: tableData.map((row) => {
              // If row has an ID property, use it as spItemId for updates
              const spItemId = row.ID || row.id || null;
              // Remove ID/id from the data to avoid duplication
              const { ID, id, ...rowData } = row;
              return { spItemId, ...rowData };
            }),
          },
        });
      }
    });

    // Process signatures if present
    Object.keys(formData).forEach((key) => {
      if (key.startsWith("signature-")) {
        const signatureListName = key;
        result.push({
          id: signatureListName,
          type: "signature",
          options: [{ name: "SignatureData", value: formData[key] }],
        });
      }
    });

    // Process attachments if present
    if (
      formData.attachments &&
      Array.isArray(formData.attachments) &&
      formData.attachments.length > 0
    ) {
      result.push({
        id: "Attachments",
        type: "attachments",
        files: formData.attachments,
      });
    }

    return result;
  }

  // ----------------------------------------------------------------
  // Below are the CRUD and attachment methods, updated to include webUrl:
  // ----------------------------------------------------------------

  createItem(listName, fieldValues) {
    return new Promise((resolve, reject) => {
      $().SPServices({
        operation: "UpdateListItems",
        webURL: this.webUrl,
        async: true,
        listName: listName,
        updates: this._buildBatchXml(fieldValues, "New"),
        completefunc: (xData, status) => {
          const errorText = $(xData.responseXML)
            .SPFilterNode("ErrorText")
            .text();
          if (errorText) {
            console.error(
              `Error creating item in list [${listName}]:`,
              errorText
            );
            return reject(errorText);
          }

          const newID = $(xData.responseXML)
            .SPFilterNode("z:row")
            .attr("ows_ID");
          resolve(parseInt(newID, 10));
        },
      });
    });
  }

  updateItem(listName, itemId, fieldValues) {
    return new Promise((resolve, reject) => {
      $().SPServices({
        operation: "UpdateListItems",
        webURL: this.webUrl,
        async: true,
        listName: listName,
        updates: this._buildBatchXml(fieldValues, "Update", itemId),
        completefunc: (xData, status) => {
          const errorText = $(xData.responseXML)
            .SPFilterNode("ErrorText")
            .text();
          if (errorText) {
            console.error(
              `Error updating item [ID=${itemId}] in list [${listName}]:`,
              errorText
            );
            return reject(errorText);
          }
          resolve();
        },
      });
    });
  }

  /**
   * Fetches the parent item and all child items that reference it, then formats for the form
   * @param {number} parentItemId - The ID of the parent item in the parent list.
   * @param {Array} formConfig - The form configuration array
   * @returns {Promise<Object>} - Resolves to a form-ready object with field IDs as keys
   */
  getForm(parentItemId, formConfig) {
    return this._getFormRaw(parentItemId).then((spData) => {
      return this._formatDataForForm(spData, formConfig);
    });
  }

  /**
   * Internal method to fetch raw SharePoint data
   * @private
   */
  _getFormRaw(parentItemId) {
    // We'll build a final result object
    const finalResult = {};

    // 1) Fetch the parent item
    const parentPromise = new Promise((resolve, reject) => {
      $().SPServices({
        operation: "GetListItems",
        webURL: this.webUrl,
        async: true,
        listName: this.parentListName,
        CAMLQuery: `
         <Query>
           <Where>
             <Eq>
               <FieldRef Name="ID" />
               <Value Type="Counter">${parentItemId}</Value>
             </Eq>
           </Where>
         </Query>
       `,
        completefunc: (xData, status) => {
          const errorText = $(xData.responseXML)
            .SPFilterNode("ErrorText")
            .text();
          if (errorText) {
            console.error(
              `Error reading parent item [ID=${parentItemId}] from list [${this.parentListName}]:`,
              errorText
            );
            return reject(errorText);
          }

          const rows = $(xData.responseXML).SPFilterNode("z:row");
          if (rows.length === 0) {
            // No parent item found - resolve with an empty object or handle as error
            console.warn(
              `No parent item found with ID=${parentItemId} in list [${this.parentListName}].`
            );
            return resolve({});
          }

          // We assume only one row because we're querying by ID
          const row = rows.first();

          // Put the parent ID in finalResult
          const parentID = row.attr("ows_ID");
          finalResult.ID = parentID;

          // Convert each attribute into a key/value in finalResult, skipping empty or null
          $.each(row[0].attributes, (idx, attr) => {
            if (attr.name.indexOf("ows_") === 0) {
              const fieldName = attr.name.substring(4);
              const fieldValue = attr.value;
              // Skip if empty or null, also skip if fieldName is "ID" (already handled above)
              if (
                !fieldValue ||
                fieldValue.trim() === "" ||
                fieldName === "ID"
              ) {
                return;
              }
              finalResult[fieldName] = fieldValue;
            }
          });

          resolve(finalResult);
        },
      });
    });

    // 2) For each child list, fetch items that reference the parent
    const childPromises = this.childListNames.map((childListName) => {
      return new Promise((resolve, reject) => {
        const camlQuery = `
         <Query>
           <Where>
             <Eq>
               <FieldRef Name="${this.parentListName}" LookupId="TRUE" />
               <Value Type="Lookup">${parentItemId}</Value>
             </Eq>
           </Where>
         </Query>
       `;
        $().SPServices({
          operation: "GetListItems",
          webURL: this.webUrl,
          async: true,
          listName: childListName,
          CAMLQuery: camlQuery,
          completefunc: (xData, status) => {
            const errorText = $(xData.responseXML)
              .SPFilterNode("ErrorText")
              .text();
            if (errorText) {
              console.error(
                `Error fetching child items from [${childListName}] for parent [ID=${parentItemId}]:`,
                errorText
              );
              return reject(errorText);
            }

            const rows = $(xData.responseXML).SPFilterNode("z:row");
            const items = [];
            rows.each(function () {
              const rowObj = {};
              $.each(this.attributes, (idx, attr) => {
                if (attr.name.indexOf("ows_") === 0) {
                  const fieldName = attr.name.substring(4);
                  const fieldValue = attr.value;
                  if (!fieldValue || fieldValue.trim() === "") {
                    return; // skip empty or null
                  }
                  if (fieldName === "ID") {
                    // We'll put the child's ID under "ID"
                    rowObj.ID = fieldValue;
                  } else {
                    rowObj[fieldName] = fieldValue;
                  }
                }
              });
              items.push(rowObj);
            });

            resolve({ childListName, items });
          },
        });
      });
    });

    // 3) Combine results
    return parentPromise
      .then(() => Promise.all(childPromises))
      .then((childResults) => {
        // childResults is an array of { childListName, items } objects
        childResults.forEach(({ childListName, items }) => {
          // For each child list, store the array of items in finalResult[childListName]
          finalResult[childListName] = items;
        });
        return finalResult;
      })
      .catch((err) => {
        console.error("getForm error:", err);
        throw err;
      });
  }

  /**
   * Transforms SharePoint data into the format expected by the form component
   * @private
   * @param {Object} spData - Data retrieved from getForm()
   * @param {Array} formConfig - The form configuration array
   * @returns {Object} - Formatted data for the form component
   */
  _formatDataForForm(spData, formConfig) {
    const result = {};

    // Process parent fields
    formConfig.forEach((section) => {
      section.fields.forEach((field) => {
        // If the field exists in the SharePoint data, add it to the result
        if (spData[field.id] !== undefined) {
          result[field.id] = spData[field.id];
        }
      });
    });

    // Add the ID for future updates
    if (spData.ID) {
      result.ID = spData.ID;
    }

    // Process child lists
    this.childListNames.forEach((childListName) => {
      if (spData[childListName] && Array.isArray(spData[childListName])) {
        // If this is a table, use the table- prefix
        if (childListName.startsWith("table-")) {
          result[childListName] = spData[childListName];
        }
        // If this is a signature, use the signature- prefix
        else if (childListName.startsWith("signature-")) {
          // Assuming signature data is in the first item's SignatureData field
          if (
            spData[childListName].length > 0 &&
            spData[childListName][0].SignatureData
          ) {
            result[childListName] = spData[childListName][0].SignatureData;
          }
        }
      }
    });

    return result;
  }

  deleteItem(listName, itemId) {
    return new Promise((resolve, reject) => {
      $().SPServices({
        operation: "UpdateListItems",
        webURL: this.webUrl,
        async: true,
        listName: listName,
        updates: `
          <Batch OnError="Continue" ListVersion="1" ViewName="">
            <Method ID="1" Cmd="Delete">
              <Field Name="ID">${itemId}</Field>
            </Method>
          </Batch>`,
        completefunc: (xData, status) => {
          const errorText = $(xData.responseXML)
            .SPFilterNode("ErrorText")
            .text();
          if (errorText) {
            console.error(
              `Error deleting item [ID=${itemId}] in list [${listName}]:`,
              errorText
            );
            return reject(errorText);
          }
          resolve();
        },
      });
    });
  }

  /**
   * Upsert (create or update) multiple child items in a single batch.
   * The lookup column in the child list is assumed to have the same name
   * as the parent list (i.e., "this.parentListName").
   *
   * @param {string} childListName
   * @param {string} parentListName
   * @param {number} parentId
   * @param {Array<object>} rowsData
   *    Each row has { spItemId, SomeColumn: value, AnotherCol: value, ... }
   * @returns {Promise<void>}
   */
  upsertChildItems(childListName, parentListName, parentId, rowsData) {
    return new Promise((resolve, reject) => {
      // If no rows to process, resolve immediately
      if (!rowsData || rowsData.length === 0) {
        return resolve();
      }

      const batchItems = rowsData
        .map((row, idx) => {
          // Skip spItemId property as it's our internal tracking field
          const { spItemId, ...dataFields } = row;
          const cmd = spItemId ? "Update" : "New";
          return this._buildBatchMethodXml(
            cmd,
            spItemId,
            {
              [parentListName]: parentId,
              ...dataFields,
            },
            idx + 1
          );
        })
        .join("");

      const batchXml = `<Batch OnError="Continue" ListVersion="1" ViewName="">${batchItems}</Batch>`;

      $().SPServices({
        operation: "UpdateListItems",
        webURL: this.webUrl,
        async: true,
        listName: childListName,
        updates: batchXml,
        completefunc: (xData, status) => {
          const errorText = $(xData.responseXML)
            .SPFilterNode("ErrorText")
            .text();
          if (errorText) {
            console.error(
              `Error upserting child items in list [${childListName}]:`,
              errorText
            );
            return reject(errorText);
          }
          resolve();
        },
      });
    });
  }

  /**
   * Add an attachment to a given item in a list.
   * @param {string} listName
   * @param {number} itemId
   * @param {File|Object} file - The file to attach (HTML File object or {name, content} object)
   */
  addAttachment(listName, itemId, file) {
    return new Promise((resolve, reject) => {
      // Handle both File objects and {name, content} objects
      if (file.content) {
        // If file already has content property (base64 string)
        $().SPServices({
          operation: "AddAttachment",
          webURL: this.webUrl,
          async: true,
          listName: listName,
          listItemID: itemId,
          fileName: file.name,
          attachment: file.content,
          completefunc: (xData, status) => {
            const errorText = $(xData.responseXML)
              .SPFilterNode("ErrorText")
              .text();
            if (errorText) {
              console.error(
                `Error adding attachment [${file.name}] to item [ID=${itemId}] in [${listName}]:`,
                errorText
              );
              return reject(errorText);
            }
            resolve();
          },
        });
      } else {
        // Handle File object by reading it
        const reader = new FileReader();
        reader.onload = (e) => {
          const fileContent = e.target.result.split("base64,")[1]; // everything after "base64,"
          $().SPServices({
            operation: "AddAttachment",
            webURL: this.webUrl,
            async: true,
            listName: listName,
            listItemID: itemId,
            fileName: file.name,
            attachment: fileContent,
            completefunc: (xData, status) => {
              const errorText = $(xData.responseXML)
                .SPFilterNode("ErrorText")
                .text();
              if (errorText) {
                console.error(
                  `Error adding attachment [${file.name}] to item [ID=${itemId}] in [${listName}]:`,
                  errorText
                );
                return reject(errorText);
              }
              resolve();
            },
          });
        };
        reader.onerror = (err) => {
          console.error("FileReader error:", err);
          reject(err);
        };
        reader.readAsDataURL(file); // read file as base64
      }
    });
  }

  /**
   * Delete an attachment from a given item in a list.
   * @param {string} listName
   * @param {number} itemId
   * @param {string} fileName
   */
  deleteAttachment(listName, itemId, fileName) {
    return new Promise((resolve, reject) => {
      $().SPServices({
        operation: "DeleteAttachment",
        webURL: this.webUrl,
        async: true,
        listName: listName,
        listItemID: itemId,
        url: fileName, // Must match the attached file's name (or server-relative URL)
        completefunc: (xData, status) => {
          const errorText = $(xData.responseXML)
            .SPFilterNode("ErrorText")
            .text();
          if (errorText) {
            console.error(
              `Error deleting attachment [${fileName}] from item [ID=${itemId}] in [${listName}]:`,
              errorText
            );
            return reject(errorText);
          }
          resolve();
        },
      });
    });
  }

  // ------------------------------------------
  // Helper methods for building CAML XML
  // ------------------------------------------

  _buildBatchXml(fieldValues, cmd, itemId) {
    const methodId = "1";
    const batch = `
      <Batch OnError="Continue" ListVersion="1" ViewName="">
        ${this._buildBatchMethodXml(cmd, itemId, fieldValues, methodId)}
      </Batch>
    `;
    return batch;
  }

  _buildBatchMethodXml(cmd, itemId, fieldValues, methodId) {
    let methodXml = `<Method ID="${methodId}" Cmd="${cmd}">`;
    if (itemId) {
      methodXml += `<Field Name="ID">${itemId}</Field>`;
    }
    for (const [fieldName, fieldValue] of Object.entries(fieldValues)) {
      if (fieldName === "spItemId") continue; // skip our custom tracking field
      methodXml += `<Field Name="${fieldName}">${this._escapeXml(
        fieldValue
      )}</Field>`;
    }
    methodXml += `</Method>`;
    return methodXml;
  }

  _buildViewFields(fieldNames) {
    if (!fieldNames || !fieldNames.length) {
      return "";
    }
    let viewFieldsXml = "<ViewFields>";
    fieldNames.forEach((name) => {
      viewFieldsXml += `<FieldRef Name="${name}" />`;
    });
    viewFieldsXml += "</ViewFields>";
    return viewFieldsXml;
  }

  _escapeXml(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Get all attachments for a specific list item
   * @param {string} listName - The name of the list
   * @param {number} itemId - The ID of the list item
   * @returns {Promise<Array>} - Array of attachment info objects
   */
  getAttachments(listName, itemId) {
    return new Promise((resolve, reject) => {
      $().SPServices({
        operation: "GetAttachmentCollection",
        webURL: this.webUrl,
        async: true,
        listName: listName,
        ID: itemId,
        completefunc: (xData, status) => {
          const errorText = $(xData.responseXML)
            .SPFilterNode("ErrorText")
            .text();
          if (errorText) {
            console.error(
              `Error getting attachments for item [ID=${itemId}] in [${listName}]:`,
              errorText
            );
            return reject(errorText);
          }

          // Parse the attachment URLs from the response
          const attachments = [];
          $(xData.responseXML)
            .find("Attachment")
            .each(function () {
              const url = $(this).text();
              const fileName = url.substring(url.lastIndexOf("/") + 1);
              attachments.push({
                url: url,
                fileName: fileName,
              });
            });

          resolve(attachments);
        },
      });
    });
  }

  /**
   * Helper method to convert lookup field values from SharePoint format to simple values
   * @param {string} value - The SharePoint lookup field value (e.g., "1;#Title")
   * @returns {Object} - Object with id and value properties
   */
  parseLookupValue(value) {
    if (!value) return { id: null, value: null };

    const parts = value.split(";#");
    if (parts.length !== 2) return { id: null, value: value };

    return {
      id: parseInt(parts[0], 10),
      value: parts[1],
    };
  }

  /**
   * Helper method to convert choice field values from SharePoint format
   * @param {string} value - The SharePoint choice field value
   * @returns {string|Array} - Single value or array for multi-choice fields
   */
  parseChoiceValue(value) {
    if (!value) return null;

    // Multi-choice fields are delimited with ;#
    if (value.indexOf(";#") > -1) {
      return value.split(";#");
    }

    return value;
  }

  /**
   * Helper method to convert date field values from SharePoint format
   * @param {string} value - The SharePoint date field value
   * @returns {string} - ISO date string
   */
  parseDateValue(value) {
    if (!value) return null;

    // Try to parse the date
    try {
      const date = new Date(value);
      return date.toISOString();
    } catch (e) {
      console.warn("Error parsing date value:", value);
      return value;
    }
  }

  /**
   * Helper method to determine the type of a field based on its name or other characteristics
   * @param {string} fieldName - The name of the field
   * @param {*} value - The value of the field
   * @returns {string} - The field type (e.g., 'text', 'lookup', 'choice', 'date')
   */
  _determineFieldType(fieldName, value) {
    // Common SharePoint field naming conventions
    if (fieldName.endsWith("LookupId") || fieldName.endsWith("_x003a_ID")) {
      return "lookup";
    }

    if (fieldName.endsWith("Date") || fieldName.includes("Date")) {
      return "date";
    }

    if (typeof value === "string" && value.indexOf(";#") > -1) {
      // Could be a lookup or multi-choice
      if (value.split(";#")[0].match(/^\d+$/)) {
        return "lookup";
      }
      return "choice";
    }

    return "text";
  }

  /**
   * Process a field value based on its type for form display
   * @param {string} fieldName - The name of the field
   * @param {*} value - The raw value from SharePoint
   * @returns {*} - The processed value ready for form display
   */
  _processFieldValue(fieldName, value) {
    const fieldType = this._determineFieldType(fieldName, value);

    switch (fieldType) {
      case "lookup":
        return this.parseLookupValue(value);
      case "choice":
        return this.parseChoiceValue(value);
      case "date":
        return this.parseDateValue(value);
      default:
        return value;
    }
  }
}
