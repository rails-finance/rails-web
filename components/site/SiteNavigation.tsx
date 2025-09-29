"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { NavigationContent } from "./NavigationContent";

export function SiteNavigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHoverMenuOpen, setIsHoverMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
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
      <header className="">
        <div className="max-w-7xl mx-auto px-4 md:px-6 pb-6">
          <div className="flex justify-between items-center">
            {/* Logo with tagline */}
            <Link href="/" className="flex items-top space-x-3">
              <div className="bg-green-600 rounded-b-lg p-3 sm:p-5 w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
                <svg className="w-10 h-10 sm:w-12 sm:h-12" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                  <use href="#icon-rails" />
                </svg>
              </div>
              <div>
                <h1 className="p-2 text-2xl/6 sm:text-3xl/8 font-extrabold tracking-tight">
                  <span className="text-green-600 font-extrabold">Rails</span>
                  <br />
                  <span className="text-slate-600 font-extrabold">DeFi Self-Service Support</span>
                </h1>
              </div>
            </Link>

            {/* Menu Toggle Button */}
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
                    className={`absolute w-full h-0.5 bg-slate-700 transition-all duration-300 ease-in-out ${
                      (isHovered && !isMobile) || (isMenuOpen && isMobile)
                        ? "rotate-45 translate-y-0"
                        : "-translate-y-2"
                    }`}
                  />
                  <span
                    className={`absolute w-full h-0.5 bg-slate-700 transition-all duration-300 ease-in-out ${
                      (isHovered && !isMobile) || (isMenuOpen && isMobile) ? "opacity-0" : "opacity-100"
                    }`}
                  />
                  <span
                    className={`absolute w-full h-0.5 bg-slate-700 transition-all duration-300 ease-in-out ${
                      (isHovered && !isMobile) || (isMenuOpen && isMobile)
                        ? "-rotate-45 translate-y-0"
                        : "translate-y-2"
                    }`}
                  />
                </div>
              </button>

              {/* Desktop Tooltip Modal */}
              {!isMobile && isHoverMenuOpen && (
                <div
                  className="absolute top-full right-0 mt-2 w-60 bg-white shadow-2xl rounded-lg border border-slate-200 p-6 z-50"
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                >
                  {/* Triangle Pointer */}
                  <div
                    className="absolute -top-2 right-4 w-0 h-0
                    border-l-[8px] border-l-transparent
                    border-r-[8px] border-r-transparent
                    border-b-[8px] border-b-white
                    before:content-[''] before:absolute before:-top-[1px] before:-left-[9px]
                    before:w-0 before:h-0
                    before:border-l-[9px] before:border-l-transparent
                    before:border-r-[9px] before:border-r-transparent
                    before:border-b-[9px] before:border-b-slate-200"
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
          <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-slate-200">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <use href="#icon-rails" />
                  </svg>
                </div>
                <div className="text-lg font-bold text-slate-600">Rails</div>
              </div>
              <button onClick={toggleMenu} className="p-3 hover:bg-slate-100 rounded-lg transition-colors">
                {/* X Icon */}
                <div className="w-6 h-5 relative flex flex-col justify-center">
                  <span className="absolute w-full h-0.5 bg-slate-700 rotate-45 translate-y-0" />
                  <span className="absolute w-full h-0.5 bg-slate-700 opacity-0" />
                  <span className="absolute w-full h-0.5 bg-slate-700 -rotate-45 translate-y-0" />
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
