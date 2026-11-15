const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` is a UUID in its usual text form, either letter case. Postgres refuses anything else as a uuid. */
export const isUuid = (value: string): boolean => UUID.test(value);
