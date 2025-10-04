import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, BookOpen, Search } from "lucide-react";
import { ThemeToggle } from "../ThemeToggle";

interface NavigationContentProps {
  onLinkClick?: () => void;
}

export function NavigationContent({ onLinkClick }: NavigationContentProps) {
  const pathname = usePathname();

  const navItems = [
    {
      href: "/",
      label: "Home",
      icon: <Home size={16} />,
      iconBg: "bg-green-600",
      activeColor: "text-green-600 dark:text-green-600",
      hoverColor: "hover:text-green-600 dark:hover:text-green-600",
    },
    {
      href: "/about",
      label: "About",
      icon: <Users size={16} />,
      iconBg: "bg-blue-600",
      activeColor: "text-blue-600 dark:text-blue-600",
      hoverColor: "hover:text-blue-600 dark:hover:text-blue-600",
    },
    {
      href: "/how-it-works",
      label: "How It Works",
      icon: <BookOpen size={16} />,
      iconBg: "bg-purple-600",
      activeColor: "text-purple-600 dark:text-purple-600",
      hoverColor: "hover:text-purple-600 dark:hover:text-purple-600",
    },
    {
      href: "/troves",
      label: "Explore Troves",
      icon: <Search size={16} />,
      iconBg: "bg-indigo-600",
      activeColor: "text-indigo-600 dark:text-indigo-600",
      hoverColor: "hover:text-indigo-600 dark:hover:text-indigo-600",
    },
  ];

  return (
    <>
      <div className="space-y-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 text-lg font-medium py-2 transition-colors ${
                isActive
                  ? `${item.activeColor} pointer-events-none`
                  : `text-slate-600 dark:text-slate-300 ${item.hoverColor}`
              }`}
              onClick={isActive ? undefined : onLinkClick}
            >
              <div className={`flex ${item.iconBg} text-white p-1.5 rounded`}>
                {item.icon}
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="my-6 border-t border-slate-200 dark:border-slate-700"></div>

      {/* Theme Toggle */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Theme</span>
        <ThemeToggle />
      </div>

      <div className="border-t border-slate-200 dark:border-slate-700 pt-6"></div>

      <div className="space-y-3">
        <div className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">Connect With Us</div>
        <div className="flex items-center gap-4">
          <a
            href="https://x.com/rails_finance"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-600 transition-colors duration-150"
            title="Follow Rails on X"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a
            href="https://www.youtube.com/@rails_finance"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-600 transition-colors duration-150"
            title="Rails Finance on YouTube"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </a>
          <a
            href="https://github.com/rails-finance"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-600 transition-colors duration-150"
            title="Rails Finance on GitHub"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
        </div>
      </div>
    </>
  );
}
