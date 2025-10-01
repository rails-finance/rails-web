"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { NavigationContent } from "./site/NavigationContent";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHoverMenuOpen, setIsHoverMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const handleMouseEnter = () => {
    if (!isMobile) {
      setIsHoverMenuOpen(true);
      setIsHovered(true);
    }
  };
  const handleMouseLeave = () => {
    if (!isMobile) {
      setIsHoverMenuOpen(false);
      setIsHovered(false);
    }
  };

  return (
    <>
      {/* Header */}
      <header className="pt-0 pb-2 relative mb-4 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 relative flex justify-between">
            {/* Left side - Rails Logo and Liquity V2 Branding */}
            <div className="flex items-start gap-3">
              <Link href="/" className="">
                <div className="bg-green-600 rounded-b p-2 w-9 h-9 flex items-center justify-center">
                  <svg className="" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <use href="#icon-rails" />
                  </svg>
                </div>
              </Link>

              {/* Liquity V2 Branding */}
              <div className="flex items-center gap-2 py-1.5">
                <svg className="w-6 h-6" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                  <use href="#icon-liquity" />
                </svg>
                <h1 className="text-xs font-semibold text-slate-700 dark:text-white">Liquity V2 Trove Explorer</h1>
              </div>
            </div>

            {/* Theme Toggle and Menu Toggle Button */}
            <div className="flex items-center gap-2">
              <div className="relative">
              <button
                onClick={isMobile ? toggleMenu : undefined}
                onMouseEnter={handleMouseEnter}
                className="p-3 cursor-pointer rounded-lg transition-colors"
                aria-label="Toggle menu"
              >
                {/* Custom Hamburger Icon */}
                <div className="w-6 h-5 relative flex flex-col justify-center">
                  <span
                    className={`absolute w-full h-0.5 bg-slate-700 dark:bg-slate-300 transition-all duration-300 ease-in-out ${
                      (isHovered && !isMobile) || (isMenuOpen && isMobile)
                        ? 'rotate-45 translate-y-0'
                        : '-translate-y-2'
                    }`}
                  />
                  <span
                    className={`absolute w-full h-0.5 bg-slate-700 dark:bg-slate-300 transition-all duration-300 ease-in-out ${
                      (isHovered && !isMobile) || (isMenuOpen && isMobile)
                        ? 'opacity-0'
                        : 'opacity-100'
                    }`}
                  />
                  <span
                    className={`absolute w-full h-0.5 bg-slate-700 dark:bg-slate-300 transition-all duration-300 ease-in-out ${
                      (isHovered && !isMobile) || (isMenuOpen && isMobile)
                        ? '-rotate-45 translate-y-0'
                        : 'translate-y-2'
                    }`}
                  />
                </div>
              </button>

              {/* Desktop Tooltip Modal */}
              {!isMobile && isHoverMenuOpen && (
                <div
                  className="absolute top-full right-0 mt-2 w-60 bg-white dark:bg-slate-800 shadow-2xl rounded-lg border border-slate-200 dark:border-slate-700 p-6 z-50"
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                >
                  {/* Triangle Pointer */}
                  <div className="absolute -top-2 right-4 w-0 h-0
                    border-l-[8px] border-l-transparent
                    border-r-[8px] border-r-transparent
                    border-b-[8px] border-b-white dark:border-b-slate-800
                    before:content-[''] before:absolute before:-top-[1px] before:-left-[9px]
                    before:w-0 before:h-0
                    before:border-l-[9px] before:border-l-transparent
                    before:border-r-[9px] before:border-r-transparent
                    before:border-b-[9px] before:border-b-slate-200 dark:before:border-b-slate-700"
                  />
                  <NavigationContent />
                </div>
              )}
            </div>
            </div>
        </div>
      </header>

      {/* Mobile Sidebar Modal */}
      {isMobile && isMenuOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={toggleMenu}>
          <div className="fixed top-0 right-0 h-full w-80 bg-white dark:bg-slate-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <use href="#icon-rails" />
                  </svg>
                </div>
                <div className="text-lg font-bold text-slate-600 dark:text-slate-300">Rails</div>
              </div>
              <button
                onClick={toggleMenu}
                className="p-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {/* X Icon */}
                <div className="w-6 h-5 relative flex flex-col justify-center">
                  <span className="absolute w-full h-0.5 bg-slate-700 dark:bg-slate-300 rotate-45 translate-y-0"/>
                  <span className="absolute w-full h-0.5 bg-slate-700 dark:bg-slate-300 opacity-0"/>
                  <span className="absolute w-full h-0.5 bg-slate-700 dark:bg-slate-300 -rotate-45 translate-y-0"/>
                </div>
              </button>
            </div>

            {/* Navigation Content */}
            <nav className="p-6">
              <NavigationContent onLinkClick={toggleMenu} />
            </nav>
          </div>
        </div>
      )}
    </>
  );
}