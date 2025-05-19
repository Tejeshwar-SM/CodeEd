// src/components/ui/Button.jsx
const Button = ({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  onClick,
  disabled = false
}) => {
  const baseStyle = "inline-flex items-center justify-center font-medium rounded-md transition-all";

  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white",
    secondary: "bg-emerald-600 hover:bg-emerald-700 text-white",
    outline: "bg-transparent border border-indigo-600 text-indigo-600 hover:bg-indigo-50",
    danger: "bg-red-600 hover:bg-red-700 text-white",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-700"
  };

  const sizes = {
    sm: "text-sm px-3 py-1.5",
    md: "text-base px-4 py-2",
    lg: "text-lg px-5 py-2.5"
  };

  const classes = `
    ${baseStyle} 
    ${variants[variant]} 
    ${sizes[size]}
    ${fullWidth ? 'w-full' : ''}
    ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
  `;

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default Button;