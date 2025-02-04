class SharePointService {
  constructor(config) {
    this.parentList = config.parentList;
    this.childLists = config.childLists || {};
    this.siteUrl = config.siteUrl;

    // Verify jQuery and SPServices are available
    if (typeof jQuery === "undefined") {
      throw new Error("jQuery is required but not loaded");
    }
    if (typeof $().SPServices === "undefined") {
      throw new Error("SPServices is required but not loaded");
    }
  }

  // Get form data by ID
  async getFormData(id) {
    try {
      // Get parent list item
      const parentData = await this.getListItem(this.parentList, id);
      if (!parentData) {
        throw new Error(
          `No item found with ID ${id} in list ${this.parentList}`
        );
      }

      // Get attachments if any
      if (parentData.Attachments) {
        const attachmentInfo = await this.getAttachments(this.parentList, id);
        if (attachmentInfo.length > 0) {
          parentData.attachments = attachmentInfo.map((att) => ({
            name: att.name,
            serverUrl: att.serverUrl,
          }));
        }
      }

      // Get child list items
      const formData = { ...parentData };
      for (const [childKey, childList] of Object.entries(this.childLists)) {
        const childItems = await this.getChildItems(childList, id);
        formData[childKey] = childItems;
      }

      return formData;
    } catch (error) {
      this.handleError("Error getting form data", error);
      throw error;
    }
  }

  // Submit new form
  async submitForm(formData) {
    try {
      // Create parent item first
      const parentData = this.extractParentData(formData);
      const parentId = await this.createListItem(this.parentList, parentData);

      // Create child items with lookup to parent
      for (const [childKey, childList] of Object.entries(this.childLists)) {
        if (formData[childKey] && Array.isArray(formData[childKey])) {
          for (const childItem of formData[childKey]) {
            await this.createListItem(childList.name, {
              ...childItem,
              [childList.lookupField]: parentId,
            });
          }
        }
      }

      // Handle attachments if any
      if (formData.attachments) {
        await this.addAttachments(
          this.parentList,
          parentId,
          formData.attachments
        );
      }

      return parentId;
    } catch (error) {
      this.handleError("Error submitting form", error);
      throw error;
    }
  }

  // Update existing form
  async updateForm(id, formData) {
    try {
      // Update parent item
      const parentData = this.extractParentData(formData);
      await this.updateListItem(this.parentList, id, parentData);

      // Handle child items
      for (const [childKey, childList] of Object.entries(this.childLists)) {
        if (formData[childKey] && Array.isArray(formData[childKey])) {
          // Get existing child items
          const existingChildren = await this.getChildItems(childList, id);

          // Delete removed items
          for (const existingChild of existingChildren) {
            if (
              !formData[childKey].find(
                (newChild) => newChild.Id === existingChild.Id
              )
            ) {
              await this.deleteListItem(childList.name, existingChild.Id);
            }
          }

          // Update or create child items
          for (const childItem of formData[childKey]) {
            if (childItem.Id) {
              await this.updateListItem(
                childList.name,
                childItem.Id,
                childItem
              );
            } else {
              await this.createListItem(childList.name, {
                ...childItem,
                [childList.lookupField]: id,
              });
            }
          }
        }
      }

      // Handle attachments
      if (formData.attachments) {
        await this.updateAttachments(this.parentList, id, formData.attachments);
      }

      return id;
    } catch (error) {
      this.handleError("Error updating form", error);
      throw error;
    }
  }

  // Private methods for SharePoint operations
  async getListItem(listName, id) {
    return new Promise((resolve, reject) => {
      $().SPServices({
        operation: "GetListItems",
        listName: listName,
        CAMLQuery: `<Query><Where><Eq><FieldRef Name='ID'/><Value Type='Counter'>${id}</Value></Eq></Where></Query>`,
        completefunc: (xData, status) => {
          if (status === "success") {
            const items = $(xData.responseXML)
              .SPFilterNode("z:row")
              .map((_, row) => {
                return this.parseSpItem(row);
              })
              .get();
            resolve(items[0]);
          } else {
            reject(new Error(`Failed to get item: ${status}`));
          }
        },
      });
    });
  }

  async getChildItems(childList, parentId) {
    return new Promise((resolve, reject) => {
      $().SPServices({
        operation: "GetListItems",
        listName: childList.name,
        CAMLQuery: `<Query><Where><Eq><FieldRef Name='${childList.lookupField}'/><Value Type='Lookup'>${parentId}</Value></Eq></Where></Query>`,
        completefunc: (xData, status) => {
          if (status === "success") {
            const items = $(xData.responseXML)
              .SPFilterNode("z:row")
              .map((_, row) => {
                return this.parseSpItem(row);
              })
              .get();
            resolve(items);
          } else {
            reject(new Error(`Failed to get child items: ${status}`));
          }
        },
      });
    });
  }

  async createListItem(listName, itemData) {
    return new Promise((resolve, reject) => {
      $().SPServices({
        operation: "UpdateListItems",
        listName: listName,
        updates: this.prepareUpdateBatch([["New", "", itemData]]),
        completefunc: (xData, status) => {
          if (status === "success") {
            const newId = $(xData.responseXML)
              .SPFilterNode("z:row")
              .attr("ows_ID");
            resolve(newId);
          } else {
            reject(new Error(`Failed to create item: ${status}`));
          }
        },
      });
    });
  }

  async updateListItem(listName, id, itemData) {
    return new Promise((resolve, reject) => {
      $().SPServices({
        operation: "UpdateListItems",
        listName: listName,
        updates: this.prepareUpdateBatch([["Update", id, itemData]]),
        completefunc: (xData, status) => {
          if (status === "success") {
            resolve(id);
          } else {
            reject(new Error(`Failed to update item: ${status}`));
          }
        },
      });
    });
  }

  async deleteListItem(listName, id) {
    return new Promise((resolve, reject) => {
      $().SPServices({
        operation: "UpdateListItems",
        listName: listName,
        updates: this.prepareUpdateBatch([["Delete", id, {}]]),
        completefunc: (xData, status) => {
          if (status === "success") {
            resolve();
          } else {
            reject(new Error(`Failed to delete item: ${status}`));
          }
        },
      });
    });
  }

  async addAttachments(listName, id, files) {
    for (const file of files) {
      await this.addAttachment(listName, id, file);
    }
  }

  async addAttachment(listName, id, file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          await $().SPServices({
            operation: "AddAttachment",
            listName: listName,
            listItemID: id,
            fileName: file.name,
            attachment: e.target.result.split(",")[1],
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // Helper methods
  parseSpItem(row) {
    const item = {};
    for (const attr of row.attributes) {
      if (attr.name.startsWith("ows_")) {
        const fieldName = attr.name.substring(4);
        item[fieldName] = this.parseSpValue(attr.value);
      }
    }
    return item;
  }

  parseSpValue(value) {
    if (value.includes(";#")) {
      const parts = value.split(";#");
      if (parts.length === 2) {
        return { id: parts[0], value: parts[1] };
      }
      return parts.reduce((acc, part, i) => {
        if (i % 2 === 0) {
          acc.push({ id: part, value: parts[i + 1] });
        }
        return acc;
      }, []);
    }
    return value;
  }

  prepareUpdateBatch(updates) {
    const batch = new Array();
    updates.forEach(([operation, id, data]) => {
      const fields = Object.entries(data)
        .map(([field, value]) => {
          return `<Field Name='${field}'>${value}</Field>`;
        })
        .join("");
      batch.push(
        `<Method ID='${batch.length + 1}' Cmd='${operation}'>${
          id ? `<Field Name='ID'>${id}</Field>` : ""
        }${fields}</Method>`
      );
    });
    return `<Batch>${batch.join("")}</Batch>`;
  }

  handleError(message, error) {
    console.error(message, error);
    window.alert(`${message}: ${error.message}`);
  }

  extractParentData(formData) {
    // Remove child list data and attachments from parent data
    const parentData = { ...formData };
    Object.keys(this.childLists).forEach((key) => delete parentData[key]);
    delete parentData.attachments;
    return parentData;
  }

  async getAttachmentUrl(listName, itemId, fileName) {
    return `${this.siteUrl}/_layouts/download.aspx?SourceUrl=${this.siteUrl}/Lists/${listName}/Attachments/${itemId}/${fileName}`;
  }
}
