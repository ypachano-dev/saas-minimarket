# Workspace Rules: SaaS MiniMarket Product Rules

These rules define standard software patterns and constraints for product catalog management in this workspace.

## 1. Product Name Validation (Duplicate Prevention)
* **Rule:** Product names must be unique within the same tenant/company.
* **Validation:** Before saving or updating a product, normalise the name (trim leading/trailing spaces, replace multiple internal spaces with a single space, and compare case-insensitively). Reject the registration if a match is found.
* **Reasoning:** Prevents duplicate catalog entries such as "Pollo", "POLLO", and "PoLlO", while allowing semantically distinct entries like "Pollo Entero" and "Pollo Despresado".

## 2. SKU Prefix and Correlation Logic (`codigo_interno`)
* **Rule:** Products in specific lines of business must have SKUs starting with designated prefixes:
  * **Carnicería (Meat Shop):** Prefix `C-` (e.g. `C-001`)
  * **Víveres (Grocery):** Prefix `V-` (e.g. `V-001`)
  * **Charcutería (Delicatessen):** Prefix `CH-` (e.g. `CH-001`)
* **Auto-generation:** If the user selects a line of business and does not provide an SKU, the system must suggest/auto-generate the next correlative SKU with 3-digit zero-padding based on existing catalog data (e.g., if `C-003` is the highest, suggest `C-004`).
* **Validation:** Ensure the user-supplied SKU is formatted in uppercase, starts with the correct prefix matching the line of business, and is unique.

## 3. Selector Lists for Field Unification (No Free-text Typos)
* **Rule:** To prevent spelling mistakes and duplicate categories, the following fields must be selected from a list of unique existing values in the database, rather than inputted as free text by default:
  * **Marca (Brand)**
  * **Línea de Negocio (Line of Business)**
  * **Tipo / Categoría (Category / Type)**
  * **Ubicación Física (Physical Location)**
* **Interface Pattern:** Display a `<select>` dropdown populated with existing unique values + a `➕ Agregar nuevo...` option. Selecting `➕ Agregar nuevo...` displays a text input to record the new option, which is then selected and saved.

## 4. Product Photograph
* **Rule:** Uploading/taking a photograph is **optional**. Do not block product registration or mark it as mandatory. The "Visión Artificial" auto-complete button is only enabled if a photo is uploaded, but manual form registration can be submitted without a photo.
