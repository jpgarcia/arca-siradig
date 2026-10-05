import type { Locator, Page } from "playwright";
import type { DataGroup, PersonalDataGroup } from "../types.js";

export async function extractPersonalData(page: Page): Promise<PersonalDataGroup[]> {
  return extractVisibleFieldsetData(page);
}

export async function extractVisibleFieldsetData(page: Page): Promise<DataGroup[]> {
  const groups: DataGroup[] = [];
  const fieldsets = page.locator("#contenido fieldset");

  for (let fieldsetIndex = 0; fieldsetIndex < (await fieldsets.count()); fieldsetIndex += 1) {
    const fieldset = fieldsets.nth(fieldsetIndex);
    if (!(await fieldset.isVisible())) {
      continue;
    }

    const title = normalizeText(await fieldset.locator("legend").first().textContent());
    const fields: DataGroup["fields"] = [];
    const rows = fieldset.locator("tr");

    for (let rowIndex = 0; rowIndex < (await rows.count()); rowIndex += 1) {
      const row = rows.nth(rowIndex);
      if (!(await row.isVisible())) {
        continue;
      }

      const label = normalizeText(await row.locator("th, [scope='row']").first().textContent());
      if (!label) {
        continue;
      }

      const value = await readRowValue(row);
      if (value) {
        fields.push({ label, value });
      }
    }

    if (title && fields.length > 0) {
      groups.push({ title, fields });
    }
  }

  return groups;
}

async function readRowValue(row: Locator): Promise<string> {
  const controls = row.locator("td input:not([type='hidden']), td textarea, td select");
  const values: string[] = [];

  for (let controlIndex = 0; controlIndex < (await controls.count()); controlIndex += 1) {
    const control = controls.nth(controlIndex);
    if (!(await control.isVisible())) {
      continue;
    }

    const tagName = await control.evaluate((element) => element.tagName.toLowerCase());
    const value =
      tagName === "select"
        ? await control.locator("option:checked").textContent()
        : await control.inputValue();
    const normalized = normalizeText(value);

    if (normalized) {
      values.push(normalized);
    }
  }

  if (values.length > 0) {
    return values.join(" ");
  }

  return normalizeText(
    await row
      .locator("td")
      .allTextContents()
      .then((items) => items.join(" ")),
  );
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
