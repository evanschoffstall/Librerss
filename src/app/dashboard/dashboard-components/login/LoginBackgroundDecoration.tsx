export function LoginBackgroundDecoration() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="
          absolute top-1/3 left-1/2 size-128 -translate-1/2 rounded-full
          bg-primary/5 blur-3xl
        "
      />
    </div>
  );
}
