export function withBase(pathname: string): string {
  const configured = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return configured ? `${configured}${path}` : path;
}
