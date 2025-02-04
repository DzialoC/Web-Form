class DynamicFormField {
  constructor(config) {
    this.id = config.id;
    this.type = config.type;
    this.label = config.label;
    this.colSize = config.colSize || 12;
    this.required = config.required ?? true;
    this.options = config.options || [];
    this.tableConfig = config.tableConfig;
    this.element = null;
    this.deletedIds = new Set();
    this.validation = config.validation;
    this.validationMessage = config.validationMessage || "Invalid input";
  }

  render() {
    const wrapper = document.createElement("div");
    wrapper.className = `col-${this.colSize}`;

    switch (this.type) {
      case "text":
      case "number":
      case "email":
      case "password":
      case "date":
      case "time":
        this.element = this.createInputField();
        break;
      case "textarea":
        this.element = this.createTextArea();
        break;
      case "radio":
        this.element = this.createRadioGroup();
        break;
      case "checkbox":
        this.element = this.createCheckbox();
        break;
      case "select":
        this.element = this.createSelect();
        break;
      case "file":
        this.element = this.createFileInput();
        break;
      case "table":
        this.element = this.createTable();
        break;
    }

    wrapper.appendChild(this.element);
    return wrapper;
  }

  createInputField() {
    const formFloating = document.createElement("div");
    formFloating.className = "form-floating mb-3";

    const input = document.createElement("input");
    input.type = this.type;
    input.className = "form-control";
    input.id = this.id;
    input.required = this.required;

    if (this.type === "date") {
      input.addEventListener("change", () => {
        if (input.value) {
          const date = new Date(input.value);
          input.dataset.spValue = date.toISOString();
        }
      });
    }

    const label = document.createElement("label");
    label.htmlFor = this.id;
    label.textContent = this.label;

    formFloating.appendChild(input);
    formFloating.appendChild(label);

    this.addValidation(input);

    return formFloating;
  }

  createTextArea() {
    const formFloating = document.createElement("div");
    formFloating.className = "form-floating mb-3";

    const textarea = document.createElement("textarea");
    textarea.className = "form-control";
    textarea.id = this.id;
    textarea.required = this.required;

    const label = document.createElement("label");
    label.htmlFor = this.id;
    label.textContent = this.label;

    formFloating.appendChild(textarea);
    formFloating.appendChild(label);

    return formFloating;
  }

  createRadioGroup() {
    const wrapper = document.createElement("div");
    wrapper.className = "d-flex w-100 mb-3";
    wrapper.setAttribute("role", "group");

    const buttonGroup = document.createElement("div");
    buttonGroup.className = "btn-group w-100";
    buttonGroup.setAttribute("role", "group");

    this.options.forEach((option, index) => {
      const input = document.createElement("input");
      input.type = "radio";
      input.className = "btn-check flex-fill";
      input.name = this.id;
      input.id = `${this.id}_${index}`;
      input.value = option.value;
      input.required = this.required;

      const label = document.createElement("label");
      label.className = "btn btn-outline-primary flex-fill";
      label.htmlFor = `${this.id}_${index}`;
      label.textContent = option.label;

      buttonGroup.appendChild(input);
      buttonGroup.appendChild(label);
    });

    wrapper.appendChild(buttonGroup);
    return wrapper;
  }

  createCheckbox() {
    const wrapper = document.createElement("div");
    wrapper.className = "form-check mb-3";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "form-check-input";
    input.id = this.id;
    input.required = this.required;

    const label = document.createElement("label");
    label.className = "form-check-label";
    label.htmlFor = this.id;
    label.textContent = this.label;

    wrapper.appendChild(input);
    wrapper.appendChild(label);

    return wrapper;
  }

  createSelect() {
    const formFloating = document.createElement("div");
    formFloating.className = "form-floating mb-3";

    const select = document.createElement("select");
    select.className = "form-select";
    select.id = this.id;
    select.required = this.required;

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Select an option";
    select.appendChild(defaultOption);

    this.options.forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      select.appendChild(optionElement);
    });

    const label = document.createElement("label");
    label.htmlFor = this.id;
    label.textContent = this.label;

    formFloating.appendChild(select);
    formFloating.appendChild(label);

    return formFloating;
  }

  createFileInput() {
    const wrapper = document.createElement("div");
    wrapper.className = "mb-3";

    const input = document.createElement("input");
    input.type = "file";
    input.className = "form-control";
    input.id = this.id;
    input.required = this.required;

    const preview = document.createElement("div");
    preview.className = "mt-2";
    preview.id = `${this.id}_preview`;

    input.addEventListener("change", (e) => this.handleFilePreview(e, preview));

    wrapper.appendChild(input);
    wrapper.appendChild(preview);

    return wrapper;
  }

  createTable() {
    const wrapper = document.createElement("div");
    wrapper.className = "table-responsive mb-3";

    if (this.tableConfig.filterable) {
      const filterRow = this.createFilterRow();
      wrapper.appendChild(filterRow);
    }

    const table = document.createElement("table");
    table.className = "table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    this.tableConfig.columns.forEach((column) => {
      const th = document.createElement("th");
      th.textContent = column.header;
      if (this.tableConfig.sortable) {
        th.style.cursor = "pointer";
        th.addEventListener("click", () => this.sortTable(table, column));
        th.innerHTML += ' <span class="sort-indicator">⇅</span>';
      }
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    tbody.id = `${this.id}_tbody`;

    table.appendChild(thead);
    table.appendChild(tbody);
    wrapper.appendChild(table);

    if (this.tableConfig.pagination) {
      const paginationControls = this.createPaginationControls(tbody);
      wrapper.appendChild(paginationControls);
    }

    const buttonWrapper = document.createElement("div");
    buttonWrapper.className = "d-flex justify-content-center gap-2 mt-2";

    // Import CSV button with file input
    const importWrapper = document.createElement("div");
    importWrapper.className = "btn btn-outline-secondary position-relative";
    importWrapper.textContent = "Import CSV";

    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".csv";
    importInput.className =
      "position-absolute top-0 start-0 opacity-0 w-100 h-100";
    importInput.style.cursor = "pointer";
    importInput.addEventListener("change", (e) => this.importCsv(e, tbody));

    importWrapper.appendChild(importInput);
    buttonWrapper.appendChild(importWrapper);

    // Add Row button
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "btn btn-primary";
    addButton.textContent = "Add Row";
    addButton.onclick = () => this.addTableRow(tbody);
    buttonWrapper.appendChild(addButton);

    // Export CSV button
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.className = "btn btn-outline-secondary";
    exportButton.textContent = "Export CSV";
    exportButton.onclick = () => this.exportToCsv(table);
    buttonWrapper.appendChild(exportButton);

    wrapper.appendChild(buttonWrapper);

    this.addTableRow(tbody);

    return wrapper;
  }

  createFilterRow() {
    const filterDiv = document.createElement("div");
    filterDiv.className = "mb-3";

    this.tableConfig.columns.forEach((column) => {
      if (column.filterable) {
        const filterWrapper = document.createElement("div");
        filterWrapper.className = "me-2 d-inline-block";

        if (column.type === "date") {
          const startDate = document.createElement("input");
          startDate.type = "date";
          startDate.className = "form-control form-control-sm";
          startDate.placeholder = `${column.header} Start`;

          const endDate = document.createElement("input");
          endDate.type = "date";
          endDate.className = "form-control form-control-sm";
          endDate.placeholder = `${column.header} End`;

          filterWrapper.appendChild(startDate);
          filterWrapper.appendChild(endDate);

          [startDate, endDate].forEach((input) => {
            input.addEventListener("change", () =>
              this.filterTable(
                column.header,
                [startDate.value, endDate.value],
                "date"
              )
            );
          });
        } else if (column.type === "number") {
          const minInput = document.createElement("input");
          minInput.type = "number";
          minInput.className = "form-control form-control-sm";
          minInput.placeholder = `Min ${column.header}`;

          const maxInput = document.createElement("input");
          maxInput.type = "number";
          maxInput.className = "form-control form-control-sm";
          maxInput.placeholder = `Max ${column.header}`;

          filterWrapper.appendChild(minInput);
          filterWrapper.appendChild(maxInput);

          [minInput, maxInput].forEach((input) => {
            input.addEventListener("input", () =>
              this.filterTable(
                column.header,
                [minInput.value, maxInput.value],
                "number"
              )
            );
          });
        } else {
          const input = document.createElement("input");
          input.type = "text";
          input.className = "form-control form-control-sm";
          input.placeholder = `Filter ${column.header}`;
          input.addEventListener("input", (e) =>
            this.filterTable(column.header, e.target.value, "text")
          );
          filterWrapper.appendChild(input);
        }

        filterDiv.appendChild(filterWrapper);
      }
    });

    return filterDiv;
  }

  addTableRow(tbody, existingId = null) {
    const row = document.createElement("tr");
    if (existingId) {
      row.dataset.id = existingId;
    }

    this.tableConfig.columns.forEach((column, index) => {
      const td = document.createElement("td");
      const input = this.createTableCellInput(column, tbody.children.length);
      td.appendChild(input);
      row.appendChild(td);
    });

    const deleteCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn btn-danger btn-sm";
    deleteButton.textContent = "Delete";
    deleteButton.onclick = () => {
      if (row.dataset.id) {
        this.deletedIds.add(row.dataset.id);
      }
      row.remove();
    };
    deleteCell.appendChild(deleteButton);
    row.appendChild(deleteCell);

    tbody.appendChild(row);
  }

  createTableCellInput(column, rowIndex) {
    const input = document.createElement("input");
    input.type = column.type;
    input.className = "form-control";
    input.name = `${this.id}_${column.header}_${rowIndex}`;
    input.required = this.required;

    if (column.options) {
      const select = document.createElement("select");
      select.className = "form-select";
      select.name = `${this.id}_${column.header}_${rowIndex}`;
      select.required = this.required;

      column.options.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        select.appendChild(optionElement);
      });

      return select;
    }

    return input;
  }

  handleFilePreview(event, previewElement) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.className = "img-fluid";
      img.file = file;
      previewElement.innerHTML = "";
      previewElement.appendChild(img);

      const reader = new FileReader();
      reader.onload = (e) => (img.src = e.target.result);
      reader.readAsDataURL(file);
    } else {
      previewElement.innerHTML = `
                <div class="alert alert-info">
                    File selected: ${file.name} (${this.formatFileSize(
        file.size
      )})
                </div>
            `;
    }
  }

  setFilePreview(fileInfo) {
    if (!fileInfo || !this.element) return;

    const preview = this.element.querySelector(`#${this.id}_preview`);
    if (!preview) return;

    preview.innerHTML = `
        <div class="alert alert-info">
            <a href="${fileInfo.serverUrl}" target="_blank" class="text-decoration-none">
                <i class="bi bi-download"></i> ${fileInfo.name}
            </a>
        </div>
    `;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  getValue() {
    if (!this.element) return null;

    if (this.type === "table") {
      const tbody = this.element.querySelector("tbody");
      const rows = [];
      tbody.querySelectorAll("tr").forEach((row) => {
        const rowData = {};
        if (row.dataset.id) {
          rowData.Id = row.dataset.id;
        }
        row.querySelectorAll("input, select").forEach((input) => {
          const columnName = input.name.split("_")[1];
          rowData[columnName] = input.value;
        });
        rows.push(rowData);
      });
      return {
        rows: rows,
        deletedIds: Array.from(this.deletedIds),
      };
    }

    const input = this.element.querySelector("input, select, textarea");
    if (!input) return null;

    if (this.type === "checkbox") {
      return input.checked;
    }

    if (this.type === "file") {
      return input.files[0] || null;
    }

    return input.value;
  }

  addValidation(input) {
    if (!this.validation) return;

    const errorDiv = document.createElement("div");
    errorDiv.className = "invalid-feedback";
    errorDiv.textContent = this.validationMessage;
    input.parentNode.appendChild(errorDiv);

    input.addEventListener("input", () => {
      const isValid = this.validation(input.value);
      input.classList.toggle("is-invalid", !isValid);
      input.classList.toggle("is-valid", isValid);
    });
  }

  sortTable(table, column) {
    const tbody = table.querySelector("tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const thIndex = Array.from(table.querySelectorAll("th")).findIndex((th) =>
      th.textContent.includes(column.header)
    );
    const currentDirection = table.dataset.sortDir === "asc" ? "desc" : "asc";

    rows.sort((a, b) => {
      const aValue = a.querySelectorAll("input, select")[thIndex]?.value || "";
      const bValue = b.querySelectorAll("input, select")[thIndex]?.value || "";

      if (column.type === "number") {
        return currentDirection === "asc"
          ? Number(aValue) - Number(bValue)
          : Number(bValue) - Number(aValue);
      } else if (column.type === "date") {
        return currentDirection === "asc"
          ? new Date(aValue) - new Date(bValue)
          : new Date(bValue) - new Date(aValue);
      } else {
        return currentDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
    });

    // Update sort indicators
    table.querySelectorAll(".sort-indicator").forEach((indicator) => {
      indicator.textContent = "⇅";
    });
    const currentTh = table.querySelectorAll("th")[thIndex];
    currentTh.querySelector(".sort-indicator").textContent =
      currentDirection === "asc" ? "↑" : "↓";

    // Update table
    table.dataset.sortDir = currentDirection;
    tbody.innerHTML = "";
    rows.forEach((row) => tbody.appendChild(row));
  }

  filterTable(columnHeader, filterValue, filterType) {
    const tbody = this.element.querySelector("tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const columnIndex = this.tableConfig.columns.findIndex(
      (col) => col.header === columnHeader
    );

    rows.forEach((row) => {
      const cell = row.querySelectorAll("input, select")[columnIndex];
      const cellValue = cell?.value || "";
      let show = true;

      switch (filterType) {
        case "date":
          const [start, end] = filterValue;
          const date = new Date(cellValue);
          show =
            (!start || date >= new Date(start)) &&
            (!end || date <= new Date(end));
          break;

        case "number":
          const [min, max] = filterValue;
          const num = Number(cellValue);
          show = (!min || num >= Number(min)) && (!max || num <= Number(max));
          break;

        case "text":
          show =
            !filterValue ||
            cellValue.toLowerCase().includes(filterValue.toLowerCase());
          break;
      }

      row.style.display = show ? "" : "none";
    });

    this.updatePagination(tbody);
  }

  createPaginationControls(tbody) {
    const wrapper = document.createElement("div");
    wrapper.className = "pagination-wrapper mt-3";

    const rowsPerPageSelect = document.createElement("select");
    rowsPerPageSelect.className = "form-select d-inline-block w-auto me-2";
    [5, 10, 25, 50].forEach((num) => {
      const option = document.createElement("option");
      option.value = num;
      option.textContent = `${num} per page`;
      rowsPerPageSelect.appendChild(option);
    });

    const paginationDiv = document.createElement("div");
    paginationDiv.className = "btn-group";

    wrapper.appendChild(rowsPerPageSelect);
    wrapper.appendChild(paginationDiv);

    // Store pagination state
    tbody.dataset.currentPage = "1";
    tbody.dataset.rowsPerPage = rowsPerPageSelect.value;

    rowsPerPageSelect.addEventListener("change", () => {
      tbody.dataset.rowsPerPage = rowsPerPageSelect.value;
      tbody.dataset.currentPage = "1";
      this.updatePagination(tbody);
    });

    this.updatePagination(tbody);
    return wrapper;
  }

  updatePagination(tbody) {
    if (!this.tableConfig.pagination) return;

    const visibleRows = Array.from(tbody.querySelectorAll("tr")).filter(
      (row) => row.style.display !== "none"
    );
    const rowsPerPage = Number(tbody.dataset.rowsPerPage);
    const currentPage = Number(tbody.dataset.currentPage);
    const totalPages = Math.ceil(visibleRows.length / rowsPerPage);

    // Update row visibility
    visibleRows.forEach((row, index) => {
      const rowPage = Math.floor(index / rowsPerPage) + 1;
      row.classList.toggle("d-none", rowPage !== currentPage);
    });

    // Update pagination controls
    const paginationDiv = tbody
      .closest(".table-responsive")
      .querySelector(".pagination-wrapper .btn-group");
    paginationDiv.innerHTML = "";

    // Previous button
    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "btn btn-outline-primary";
    prevButton.textContent = "←";
    prevButton.disabled = currentPage === 1;
    prevButton.onclick = () => {
      tbody.dataset.currentPage = currentPage - 1;
      this.updatePagination(tbody);
    };
    paginationDiv.appendChild(prevButton);

    // Page buttons
    for (let i = 1; i <= totalPages; i++) {
      const pageButton = document.createElement("button");
      pageButton.type = "button";
      pageButton.className = `btn btn-outline-primary${
        i === currentPage ? " active" : ""
      }`;
      pageButton.textContent = i;
      pageButton.onclick = () => {
        tbody.dataset.currentPage = i;
        this.updatePagination(tbody);
      };
      paginationDiv.appendChild(pageButton);
    }

    // Next button
    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "btn btn-outline-primary";
    nextButton.textContent = "→";
    nextButton.disabled = currentPage === totalPages;
    nextButton.onclick = () => {
      tbody.dataset.currentPage = currentPage + 1;
      this.updatePagination(tbody);
    };
    paginationDiv.appendChild(nextButton);
  }

  exportToCsv(table) {
    const headers = Array.from(table.querySelectorAll("th"))
      .map((th) => th.textContent.replace(" ⇅", ""))
      .slice(0, -1); // Remove delete column

    const visibleRows = Array.from(table.querySelectorAll("tbody tr")).filter(
      (row) => row.style.display !== "none"
    );

    const rows = visibleRows.map((row) =>
      Array.from(row.querySelectorAll("input, select")).map(
        (input) => input.value
      )
    );

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.id}_export.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Add this new method for CSV import
  async importCsv(event, tbody) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const rows = text
        .split("\n")
        .map((row) => row.split(",").map((cell) => cell.trim()));

      // Validate headers
      const headers = rows[0];
      const validHeaders = this.tableConfig.columns
        .map((col) => col.header)
        .every((header) => headers.includes(header));

      if (!validHeaders) {
        throw new Error("CSV headers do not match table columns");
      }

      // Clear existing rows except the header
      tbody.innerHTML = "";

      // Add new rows from CSV
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].length === 1 && rows[i][0] === "") continue; // Skip empty rows

        this.addTableRow(tbody);
        const newRow = tbody.lastElementChild;
        const inputs = newRow.querySelectorAll("input, select");

        headers.forEach((header, index) => {
          const columnConfig = this.tableConfig.columns.find(
            (col) => col.header === header
          );
          if (columnConfig) {
            const input =
              inputs[this.tableConfig.columns.indexOf(columnConfig)];
            if (input) {
              input.value = rows[i][index] || "";
            }
          }
        });
      }

      // Reset file input
      event.target.value = "";
    } catch (error) {
      console.error("Error importing CSV:", error);
      alert(`Error importing CSV: ${error.message}`);
    }
  }
}
