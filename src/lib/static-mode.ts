/** True when the app is built/served as static files only (no Node server). */
export function isStaticOnly(): boolean {
  return process.env.NEXT_PUBLIC_STATIC_ONLY !== "false";
}
