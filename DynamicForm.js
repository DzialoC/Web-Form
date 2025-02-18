class DynamicForm {
  constructor(containerId, rows) {
    this.container = document.getElementById(containerId);
    this.rows = rows;
    this.currentRows = [];
    this.fields = new Map();
    this.branchHistory = {};
  }

  render(existingData = null) {
    this.container.innerHTML = "";
    const form = document.createElement("form");
    form.className = "needs-validation";
    form.noValidate = true;

    // Render first row
    this.renderRow(0, form);

    // If we have existing data, populate the form
    if (existingData) {
      this.setFormData(existingData);
    }

    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.className = "btn btn-primary mt-3";
    submitButton.textContent = "Submit";

    form.appendChild(submitButton);
    this.container.appendChild(form);

    form.addEventListener("submit", (e) => this.handleSubmit(e));
  }

  renderRow(rowIndex, form) {
    const rowConfig = this.rows[rowIndex];
    if (!rowConfig) return;

    const rowElement = document.createElement("div");
    rowElement.className = "row mb-3";
    rowElement.dataset.rowId = rowIndex;

    rowConfig.fields.forEach((fieldConfig) => {
      const field = new DynamicFormField(fieldConfig);
      const fieldElement = field.render();
      rowElement.appendChild(fieldElement);
      this.fields.set(fieldConfig.id, field);

      if (fieldConfig.type === "radio") {
        // For radio groups, attach to all inputs
        const inputs = fieldElement.querySelectorAll("input[type='radio']");
        inputs.forEach((input) => {
          input.addEventListener("change", () =>
            this.handleBranching(rowConfig, fieldConfig, input.value)
          );
        });
      } else if (fieldConfig.type === "select") {
        const input = fieldElement.querySelector("select");
        input.addEventListener("change", () =>
          this.handleBranching(rowConfig, fieldConfig, input.value)
        );
      }
    });

    this.currentRows.push(rowIndex);
    form.insertBefore(rowElement, form.lastElementChild);
  }

  handleBranching(rowConfig, fieldConfig, value) {
    console.log("Branching Debug:", {
      rowConfigId: rowConfig.id,
      fieldId: fieldConfig.id,
      value: value,
      currentRows: this.currentRows,
      conditions: rowConfig.branchConditions,
    });
    const currentIndex = this.currentRows.findIndex(
      (rowId) => rowId === rowConfig.id
    );
    console.log("Current Index:", currentIndex);
    if (currentIndex === -1) return;
    // Determine the intended branch row based on the new value
    let intendedBranchRow = null;
    if (rowConfig.branchConditions) {
      // Add support for defaultBranch
      const defaultBranch = rowConfig.branchConditions.find(
        (condition) =>
          condition.fieldId === fieldConfig.id &&
          condition.defaultBranch === true
      );

      for (const condition of rowConfig.branchConditions) {
        if (condition.fieldId === fieldConfig.id) {
          let shouldBranch = false;
          if (Array.isArray(condition.value)) {
            shouldBranch =
              condition.operator === "or"
                ? condition.value.includes(value)
                : condition.value.every((v) => v === value);
          } else if (condition.defaultBranch) {
            // If this is a default branch condition, always branch
            shouldBranch = true;
          } else {
            shouldBranch = condition.value === value;
          }
          if (shouldBranch) {
            intendedBranchRow = condition.nextRow;
            break;
          }
        }
      }

      // If no specific condition matched but we have a default branch, use it
      if (intendedBranchRow === null && defaultBranch) {
        intendedBranchRow = defaultBranch.nextRow;
      }
    }
    if (intendedBranchRow === null) {
      intendedBranchRow = rowConfig.id + 1;
    }
    // Update branch history to record the chosen branch for this row
    if (rowConfig.branchConditions) {
      this.branchHistory[rowConfig.id] = intendedBranchRow;
    }
    // If the branch remains unchanged (the next row is already the intended branch), do nothing.
    if (this.currentRows[currentIndex + 1] === intendedBranchRow) {
      return;
    }
    // Otherwise remove all subsequent rows and render the new branch row
    const rowsToRemove = this.currentRows.slice(currentIndex + 1);
    rowsToRemove.forEach((rowIndex) => {
      const rowElement = this.container.querySelector(
        `[data-row-id="${rowIndex}"]`
      );
      if (rowElement) rowElement.remove();
    });
    this.currentRows = this.currentRows.slice(0, currentIndex + 1);
    const form = this.container.querySelector("form");
    if (intendedBranchRow < this.rows.length) {
      this.renderRow(intendedBranchRow, form);
    }
  }

  handleSubmit(event) {
    event.preventDefault();
    const formData = {};

    this.fields.forEach((field, fieldId) => {
      const value = field.getValue();
      if (field.type === "table") {
        formData[fieldId] = value;
      } else {
        formData[fieldId] = value;
      }
    });
    // Append branch history in stringified format to the form submission data
    formData.branchHistory = JSON.stringify(this.branchHistory);
    console.log("Form Data:", formData);
    return formData;
  }

  // New method to set form data
  setFormData(data) {
    // Clear any existing rows except the first one
    const rowsToRemove = this.currentRows.slice(1);
    rowsToRemove.forEach((rowIndex) => {
      const rowElement = this.container.querySelector(
        `[data-row-id="${rowIndex}"]`
      );
      if (rowElement) rowElement.remove();
    });
    this.currentRows = this.currentRows.slice(0, 1);

    // Set values for the first row
    const firstRowConfig = this.rows[0];
    firstRowConfig.fields.forEach((fieldConfig) => {
      const field = this.fields.get(fieldConfig.id);
      if (field && data[fieldConfig.id] !== undefined) {
        this.setFieldValue(field, data[fieldConfig.id]);
      }
    });

    // Trigger branching logic based on field values
    firstRowConfig.fields.forEach((fieldConfig) => {
      if (
        (fieldConfig.type === "radio" || fieldConfig.type === "select") &&
        data[fieldConfig.id]
      ) {
        // Find the row config and trigger branching
        this.handleBranching(firstRowConfig, fieldConfig, data[fieldConfig.id]);

        // Set values for subsequent rows that were rendered due to branching
        this.currentRows.slice(1).forEach((rowIndex) => {
          const rowConfig = this.rows[rowIndex];
          if (rowConfig) {
            rowConfig.fields.forEach((fieldConfig) => {
              const field = this.fields.get(fieldConfig.id);
              if (field && data[fieldConfig.id] !== undefined) {
                this.setFieldValue(field, data[fieldConfig.id]);
              }
            });
          }
        });
      }
    });
  }

  // Helper method to set field value
  setFieldValue(field, value) {
    if (!field.element) return;

    switch (field.type) {
      case "radio":
        const radioInput = field.element.querySelector(
          `input[value="${value}"]`
        );
        if (radioInput) radioInput.checked = true;
        break;

      case "checkbox":
        const checkboxInput = field.element.querySelector("input");
        if (checkboxInput) checkboxInput.checked = value;
        break;

      case "table":
        const tbody = field.element.querySelector("tbody");
        if (tbody) {
          // Clear existing rows
          tbody.innerHTML = "";
          // Add rows for each data item
          if (Array.isArray(value)) {
            value.forEach((rowData) => {
              field.addTableRow(tbody);
              const lastRow = tbody.lastElementChild;
              Object.entries(rowData).forEach(([key, cellValue]) => {
                const input = lastRow.querySelector(`[name*="_${key}_"]`);
                if (input) input.value = cellValue;
              });
            });
          }
        }
        break;

      case "file":
        // Files can't be pre-populated due to security restrictions
        // But we can show the filename if provided
        if (value && value.name) {
          const preview = field.element.querySelector(`#${field.id}_preview`);
          if (preview) {
            preview.innerHTML = `
              <div class="alert alert-info">
                Current file: ${value.name}
              </div>
            `;
          }
        }
        break;

      default:
        const input = field.element.querySelector("input, select, textarea");
        if (input) input.value = value;
        break;
    }
  }
}
