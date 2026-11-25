// Accept a single mailbox, not a Nodemailer address list or display name.
export const isEthnMailAddress = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 254 && /^[^\s@<>,;:"\\()]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value);
