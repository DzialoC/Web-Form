class SharePointLookupService {
  constructor(config) {
    this.siteUrl = config.siteUrl;
    // Verify jQuery and SPServices are available
    if (typeof jQuery === "undefined") {
      throw new Error("jQuery is required but not loaded");
    }
    if (typeof $().SPServices === "undefined") {
      throw new Error("SPServices is required but not loaded");
    }
  }

  // Fetch items from the specified list and concatenate the values
  // of the provided columns (in order) into a single string.
  // listName: the name of the SharePoint list.
  // columns: an array of column names, in order, that will be concatenated.
  // camlQuery: (optional) a CAML query string to filter the items.
  async getConcatenatedOptions(listName, columns, camlQuery = "") {
    return new Promise((resolve, reject) => {
      $().SPServices({
        operation: "GetListItems",
        listName: listName,
        CAMLQuery: camlQuery,
        completefunc: (xData, status) => {
          if (status !== "success") {
            return reject(
              new Error(
                `Failed to fetch items from list "${listName}": ${status}`
              )
            );
          }
          const options = $(xData.responseXML)
            .SPFilterNode("z:row")
            .map((_, row) => {
              // For each row, concatenate the specified columns in order.
              let concatenatedValue = columns
                .map((column) => {
                  // Retrieve each column value from the attribute ows_ColumnName
                  return $(row).attr(`ows_${column}`) || "";
                })
                .join(" "); // Using a space as delimiter (you can adjust if desired)
              return concatenatedValue.trim();
            })
            .get();
          resolve(options);
        },
      });
    });
  }

  // Given a reference to a <select> element, this method populates it
  // with <option> elements using the fetched list entries.
  // selectElement: a DOM reference to the <select> element.
  // listName: the name of the SharePoint list.
  // columns: an array of column names that will be concatenated.
  // camlQuery: (optional) a CAML query string to filter items.
  /*
  Example Usage:
  1. For a regular dropdown (select element in a form):
    const lookupService = new SharePointLookupService({ siteUrl: "https://your-site-url" });
    const selectElement = document.getElementById("yourSelectId");
    lookupService.populateDropDown(selectElement, "YourLookupList", ["Title", "ID"]);

  2. For a table cell dropdown:
    // During table cell creation where a <select> element is needed:
    const cellSelect = document.createElement("select");
    cellSelect.className = "form-select";
    lookupService.populateDropDown(cellSelect, "YourLookupList", ["Title", "AnotherColumn"]);
    // Append cellSelect to your table cell.
  */
  async populateDropDown(selectElement, listName, columns, camlQuery = "") {
    try {
      const options = await this.getConcatenatedOptions(
        listName,
        columns,
        camlQuery
      );
      // Clear existing options
      selectElement.innerHTML = "";
      // Optionally add a default placeholder option
      const placeholderOption = document.createElement("option");
      placeholderOption.value = "";
      placeholderOption.textContent = "Select an option";
      selectElement.appendChild(placeholderOption);
      // Append fetched options
      options.forEach((optionText) => {
        const optionElement = document.createElement("option");
        optionElement.value = optionText;
        optionElement.textContent = optionText;
        selectElement.appendChild(optionElement);
      });
    } catch (error) {
      console.error("Error populating dropdown:", error);
    }
  }
}
