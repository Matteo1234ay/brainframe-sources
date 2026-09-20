export function withBase(pathname: string): string {
  const configured = (process.env.PUBLIC_BASE_PATH ?? import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return configured ? `${configured}${path}` : path;
}
