'use client';

import React from 'react';
import { FaChevronRight, FaChevronDown } from 'react-icons/fa';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function CollapsibleSection({ title, children, isCollapsed, onToggle }: CollapsibleSectionProps) {
  return (
    <div className="container mx-auto px-4 py-1 lg:py-4">
      <button
        onClick={onToggle}
        className="text-sm mt-2 mb-1 flex items-center gap-2 w-full text-left text-text-secondary"
      >
        {title}
        {isCollapsed ? <FaChevronRight className="text-lg" /> : <FaChevronDown className="text-lg" />}
      </button>
      {!isCollapsed && children}
    </div>
  );
}
