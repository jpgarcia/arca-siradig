import { input, password, select } from "@inquirer/prompts";
import type { ArcaCredentials, MenuItem, Person } from "../types.js";

const MAIN_MENU_ACTION = "main-menu";

export async function promptFormSubmission(): Promise<boolean> {
  try {
    return await select(
      {
        message: "¿Querés generar la presentación y enviarla al empleador?",
        default: false,
        choices: [
          { name: "Cancelar", value: false },
          { name: "Aceptar — Generar Presentación", value: true },
        ],
      },
      { output: process.stderr },
    );
  } catch (error) {
    if (error instanceof Error && ["ExitPromptError", "AbortPromptError"].includes(error.name)) {
      return false;
    }
    throw error;
  }
}

export async function promptCredentials(
  defaults: Partial<ArcaCredentials>,
  options: { usePasswordDefault?: boolean } = {},
): Promise<ArcaCredentials> {
  const usePasswordDefault = options.usePasswordDefault ?? true;
  const cuit = await input({
    message: "CUIT/CUIL:",
    default: defaults.cuit,
    validate: (value) => (value.trim().length > 0 ? true : "Ingresá un CUIT/CUIL."),
  });
  const normalizedCuit = cuit.trim();
  const normalizedDefaultCuit = defaults.cuit?.trim();

  const passwordDefault =
    usePasswordDefault && normalizedCuit === normalizedDefaultCuit ? defaults.password : undefined;
  const passwordMessage = passwordDefault
    ? `Clave fiscal (${maskSecret(passwordDefault)}; presioná enter para usarla):`
    : "Clave fiscal:";
  const passwordValue = await password({
    message: passwordMessage,
    mask: "*",
    validate: (value) => (value.length > 0 || passwordDefault ? true : "Ingresá la clave fiscal."),
  });

  return {
    cuit: normalizedCuit,
    password: passwordValue.length > 0 ? passwordValue : (passwordDefault ?? ""),
  };
}

export async function promptMissingCredentials(
  values: Partial<ArcaCredentials>,
  defaults: Partial<ArcaCredentials>,
): Promise<ArcaCredentials> {
  const cuit =
    values.cuit ??
    (
      await input({
        message: "CUIT/CUIL:",
        default: defaults.cuit,
        validate: (value) => (value.trim().length > 0 ? true : "Ingresá un CUIT/CUIL."),
      })
    ).trim();
  const passwordDefault = cuit === defaults.cuit?.trim() ? defaults.password : undefined;
  const resolvedPassword =
    values.password ??
    (await promptPassword({
      defaultPassword: passwordDefault,
      defaultLabel: passwordDefault
        ? `Clave fiscal (${maskSecret(passwordDefault)}; presioná enter para usarla):`
        : "Clave fiscal:",
    }));

  return { cuit, password: resolvedPassword };
}

export async function promptPerson(persons: Person[]): Promise<Person> {
  const person = await select({
    message: "Seleccione la persona a representar:",
    choices: persons.map((item) => ({
      name: item.id ? `${item.id}: ${item.name}` : item.name,
      value: item,
    })),
  });

  return person;
}

export async function promptMenuItem(items: MenuItem[]): Promise<MenuItem> {
  const item = await select({
    message: "Seleccione una acción:",
    choices: items.map((menuItem) => ({
      name: menuItem.label,
      value: menuItem,
      disabled: menuItem.enabled ? false : "No disponible en esta versión",
    })),
  });

  return item;
}

export async function promptPersonalDataAction(): Promise<"main-menu"> {
  console.log();

  return select({
    message: "Seleccione una opción:",
    choices: [{ name: "Menú Principal", value: MAIN_MENU_ACTION }],
  });
}

function maskSecret(secret: string): string {
  return "*".repeat(Math.max(secret.length, 4));
}

async function promptPassword(options: {
  defaultPassword?: string;
  defaultLabel: string;
}): Promise<string> {
  const passwordValue = await password({
    message: options.defaultLabel,
    mask: "*",
    validate: (value) =>
      value.length > 0 || options.defaultPassword ? true : "Ingresá la clave fiscal.",
  });

  return passwordValue.length > 0 ? passwordValue : (options.defaultPassword ?? "");
}
