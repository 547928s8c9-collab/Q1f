export function normalizePath(path: string): string {
  return path.split("/").map(segment => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
      return ":id";
    }
    if (/^\d+$/.test(segment)) {
      return ":id";
    }
    if (/^[0-9a-f]{24,}$/i.test(segment)) {
      return ":id";
    }
    return segment;
  }).join("/");
}
