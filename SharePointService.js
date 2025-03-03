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
   * @param {Array} formData - The dynamic form data array.
   *                          Example structure:
   * [
   *   {
   *     id: "MyParentList",
   *     spItemId: 10, // if existing item to update
   *     fields: [
   *       { name: "Title", value: "Some Title" },
   *       { name: "AnotherField", value: "Some Value" }
   *     ]
   *   },
   *   {
   *     id: "ChildListA",
   *     type: "table",
   *     tableConfig: {
   *       data: [
   *         { spItemId: 1, Column1: "Foo", Column2: "Bar" },
   *         { spItemId: null, Column1: "NewOne", Column2: "Data" }
   *       ]
   *     }
   *   },
   *   {
   *     id: "ChildListB",
   *     type: "signature",
   *     options: [
   *       { name: "SignatureField", value: "Some Base64 or text" }
   *     ]
   *   },
   *   {
   *     id: "Attachments",
   *     type: "attachments",
   *     files: [ FileObject1, FileObject2 ]
   *   }
   * ]
   *
   * @returns {Promise<void>}
   */
  submitForm(formData) {
    return new Promise((resolve, reject) => {
      // 1) Find the parent object in formData
      const parentObj = formData.find(
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
            // Find formData entry with id == childList
            const childObj = formData.find((item) => item.id === childList);
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
          const attachmentObj = formData.find(
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
          resolve();
        })
        .catch((err) => {
          console.error("submitForm error:", err);
          reject(err);
        });
    });
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
   * Fetches the parent item and all child items that reference it.
   * @param {number} parentItemId - The ID of the parent item in the parent list.
   * @returns {Promise<Object>} - Resolves to the JSON object described.
   */
  getForm(parentItemId) {
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
      const batchItems = rowsData
        .map((row, idx) => {
          const cmd = row.spItemId ? "Update" : "New";
          return this._buildBatchMethodXml(
            cmd,
            row.spItemId,
            {
              [parentListName]: parentId,
              ...row,
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
   * @param {File} file - The file to attach (HTML File object)
   */
  addAttachment(listName, itemId, file) {
    return new Promise((resolve, reject) => {
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
}
