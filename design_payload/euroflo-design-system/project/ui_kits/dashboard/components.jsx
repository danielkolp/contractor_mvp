// Euroflo dashboard — shared primitives
const { useState, useEffect, useRef } = React;

// Lucide icon as React component (renders an <i> that lucide replaces)
function Icon({ name, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = "";
      const el = document.createElement("i");
      el.setAttribute("data-lucide", name);
      ref.current.appendChild(el);
      window.lucide.createIcons({ icons: window.lucide.icons, nameAttr: "data-lucide" });
    }
  }, [name]);
  return <span ref={ref} className="lic" style={{ display: "inline-flex", ...style }}></span>;
}

function Btn({ variant = "primary", size, icon, children, onClick }) {
  const cls = `btn btn-${variant}${size === "sm" ? " btn-sm" : ""}`;
  return (
    <button className={cls} onClick={onClick}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

function money(n) {
  return "$" + n.toLocaleString("en-CA");
}

// Toast system via custom event
function useToasts() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    function on(e) {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t, { id, msg: e.detail }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
    }
    window.addEventListener("ef:toast", on);
    return () => window.removeEventListener("ef:toast", on);
  }, []);
  return toasts;
}
function toast(msg) {
  window.dispatchEvent(new CustomEvent("ef:toast", { detail: msg }));
}
function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <Icon name="check-circle-2" />
          {t.msg}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Icon, Btn, money, toast, Toasts });
