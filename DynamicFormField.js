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

    const label = document.createElement("label");
    label.htmlFor = this.id;
    label.textContent = this.label;

    formFloating.appendChild(input);
    formFloating.appendChild(label);

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
    wrapper.className = "btn-group mb-3";
    wrapper.setAttribute("role", "group");

    this.options.forEach((option, index) => {
      const input = document.createElement("input");
      input.type = "radio";
      input.className = "btn-check";
      input.name = this.id;
      input.id = `${this.id}_${index}`;
      input.value = option.value;
      input.required = this.required;

      const label = document.createElement("label");
      label.className = "btn btn-outline-primary";
      label.htmlFor = `${this.id}_${index}`;
      label.textContent = option.label;

      wrapper.appendChild(input);
      wrapper.appendChild(label);
    });

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

    const table = document.createElement("table");
    table.className = "table";

    // Create header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    this.tableConfig.columns.forEach((column) => {
      const th = document.createElement("th");
      th.textContent = column.header;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Create body
    const tbody = document.createElement("tbody");
    tbody.id = `${this.id}_tbody`;

    // Add row button
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "btn btn-primary mt-2";
    addButton.textContent = "Add Row";
    addButton.onclick = () => this.addTableRow(tbody);

    table.appendChild(thead);
    table.appendChild(tbody);
    wrapper.appendChild(table);
    wrapper.appendChild(addButton);

    // Add initial row
    this.addTableRow(tbody);

    return wrapper;
  }

  addTableRow(tbody) {
    const row = document.createElement("tr");

    this.tableConfig.columns.forEach((column, index) => {
      const td = document.createElement("td");
      const input = this.createTableCellInput(column, tbody.children.length);
      td.appendChild(input);
      row.appendChild(td);
    });

    // Delete button cell
    const deleteCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn btn-danger btn-sm";
    deleteButton.textContent = "Delete";
    deleteButton.onclick = () => row.remove();
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
        row.querySelectorAll("input, select").forEach((input) => {
          const columnName = input.name.split("_")[1];
          rowData[columnName] = input.value;
        });
        rows.push(rowData);
      });
      return rows;
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
}
