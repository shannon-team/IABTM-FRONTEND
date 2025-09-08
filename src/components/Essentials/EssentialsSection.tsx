'use client';

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, ShoppingCart, ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import { useEssentialsProducts } from "@/hooks/useEssentialsProducts";
import EssentialsProductCard from "./EssentialsProductCard";
import Footer from "@/app/shop/components/Footer";
import { useCart } from "@/context/Cart";

export default function EssentialsSection() {
  const { data: products, isLoading, isError } = useEssentialsProducts(100);
  const { cartCount } = useCart();

  const [priceRange, setPriceRange] = useState([1, 10000]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedTheme, setSelectedTheme] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState("featured");

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    if (!products) return [];

    let filtered = products.filter((product: any) => {
      const price = parseFloat(product.price);
      return price >= priceRange[0] && price <= priceRange[1];
    });

    // Apply category filter
    if (selectedCategory !== "All") {
      // You can implement category filtering based on your product structure
    }

    // Apply theme filter
    if (selectedTheme.length > 0) {
      // You can implement theme filtering based on your product structure
    }

    // Apply sorting
    switch (sortBy) {
      case "price-low":
        filtered.sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price));
        break;
      case "price-high":
        filtered.sort((a: any, b: any) => parseFloat(b.price) - parseFloat(a.price));
        break;
      case "name":
        filtered.sort((a: any, b: any) => a.title.localeCompare(b.title));
        break;
      default:
        // Keep original order for "featured"
        break;
    }

    return filtered;
  }, [products, priceRange, selectedCategory, selectedTheme, sortBy]);

  const categories = ["All", "Books", "Electronics", "Clothing", "Accessories", "Games", "For Kids"];
  const themes = ["Anti-Stress", "Productivity", "Fashion", "Fitness", "Financial Productivity"];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading essentials...</div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-red-600">Error loading essentials products</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
                <ChevronLeft className="w-6 h-6" />
              </Link>
              <h1 className="ml-4 text-xl font-semibold text-gray-900">Essentials</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <button className="p-2 text-gray-500 hover:text-gray-700">
                <Bell className="w-6 h-6" />
              </button>
              <Link href="/cart" className="relative p-2 text-gray-500 hover:text-gray-700">
                <ShoppingCart className="w-6 h-6" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters Sidebar */}
          <aside className="lg:w-64">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Filters</h2>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="lg:hidden"
                >
                  <ChevronDown className={`w-5 h-5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>
              </div>
              
              <div className={`lg:block ${showFilters ? 'block' : 'hidden'}`}>
                {/* Price Range */}
                <div className="mb-6">
                  <h3 className="font-medium mb-3">Price Range</h3>
                  <div className="space-y-2">
                    <input
                      type="range"
                      min="1"
                      max="10000"
                      value={priceRange[1]}
                      onChange={(e) => setPriceRange([priceRange[0], parseInt(e.target.value)])}
                      className="w-full"
                    />
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>${priceRange[0]}</span>
                      <span>${priceRange[1]}</span>
                    </div>
                  </div>
                </div>

                {/* Sort By */}
                <div className="mb-6">
                  <h3 className="font-medium mb-3">Sort By</h3>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    <option value="featured">Featured</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="name">Name: A to Z</option>
                  </select>
                </div>

                {/* Categories */}
                <div className="mb-6">
                  <h3 className="font-medium mb-3">Categories</h3>
                  <ul className="space-y-2 text-sm">
                    {categories.map((category) => (
                      <li key={category}>
                        <button
                          onClick={() => setSelectedCategory(category)}
                          className={`text-left w-full ${
                            selectedCategory === category ? 'font-medium text-blue-600' : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          {category === "All" ? "– All" : category}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Themes */}
                <div className="mb-6">
                  <h3 className="font-medium mb-3">Themes</h3>
                  <ul className="space-y-2 text-sm">
                    {themes.map((theme) => (
                      <li key={theme} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={theme.toLowerCase().replace(' ', '-')}
                          checked={selectedTheme.includes(theme)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTheme([...selectedTheme, theme]);
                            } else {
                              setSelectedTheme(selectedTheme.filter(t => t !== theme));
                            }
                          }}
                          className="w-4 h-4"
                        />
                        <label htmlFor={theme.toLowerCase().replace(' ', '-')}>{theme}</label>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1">
            {/* Results Header */}
            <div className="flex items-center justify-between mb-6">
              <p className="text-gray-600">
                Showing {filteredProducts.length} products
              </p>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredProducts.map((product: any) => (
                <EssentialsProductCard
                  key={product.id}
                  id={product.id}
                  title={product.title}
                  description={product.description}
                  imageUrl={product.image}
                  price={product.price}
                  handle={product.handle}
                  variantId={product.variantId}
                />
              ))}
            </div>

            {filteredProducts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No products found matching your criteria.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
} 