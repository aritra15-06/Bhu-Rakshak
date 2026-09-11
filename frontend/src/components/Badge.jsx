export function Badge({ status, children }) {
  return <span className={`badge ${status}`}>{children}</span>;
}
