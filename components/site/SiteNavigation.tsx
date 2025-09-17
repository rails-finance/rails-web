"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/icon";

export function SiteNavigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  return (
    <>
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm  border-gray-200/50">
        <div className="max-w-7xl mx-auto px-6 pb-6">
          <div className="flex justify-between items-center">
            {/* Logo with tagline */}
            <Link href="/" className="flex items-top space-x-3">
              <div className="bg-green-600 rounded-b-lg p-3 sm:p-4 w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
                <svg className="w-10 h-10 sm:w-12 sm:h-12" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                  <use href="#icon-rails" />
                </svg>
              </div>
              <div>
                <h1 className="p-2 text-2xl/6 sm:text-3xl/8 font-medium">
                	<span className="text-green-600 font-bold">Rails</span>
                	<br /><span className="text-slate-600 font-bold">DeFi Self-Service Support</span></h1>
                              </div>
            </Link>

            {/* Menu Toggle Button */}
            <button
              onClick={toggleMenu}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Toggle menu"
            >
              <Icon name="menu" size={24} className="text-gray-700" />
            </button>
          </div>
        </div>
      </header>

      {/* Modal Overlay */}
      {isMenuOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={toggleMenu}>
          <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <use href="#icon-rails" />
                  </svg>
                </div>
                <div className="text-lg font-bold text-gray-900">Rails</div>
              </div>
              <button
                onClick={toggleMenu}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Icon name="x" size={24} className="text-gray-700" />
              </button>
            </div>

            {/* Navigation Links */}
            <nav className="p-6">
              <div className="space-y-4">
                <Link
                  href="/"
                  className="block text-lg font-medium text-gray-900 hover:text-green-600 py-2 transition-colors"
                  onClick={toggleMenu}
                >
                  Home
                </Link>
                <Link
                  href="/about"
                  className="block text-lg font-medium text-gray-900 hover:text-green-600 py-2 transition-colors"
                  onClick={toggleMenu}
                >
                  About
                </Link>
                
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200 my-6"></div>

              {/* Social Media Links */}
              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Follow us
                </div>
                <div className="space-y-2">
                  <a
                    href="https://x.com/rails_finance"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-base text-gray-700 hover:text-green-600 py-1 transition-colors"
                  >
                    X
                  </a>
                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-base text-gray-700 hover:text-green-600 py-1 transition-colors"
                  >
                    GitHub
                  </a>
                </div>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}