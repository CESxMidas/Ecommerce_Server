import dotenv from "dotenv";
import mongoose from "mongoose";

import CategoryModel from "../models/category.model.js";
import ProductModel from "../models/product.model.js";
import CouponModel from "../models/coupon.model.js";
import BannerModel from "../models/banner.model.js";
import BlogModel from "../models/blog.model.js";
import ReviewModel from "../models/review.model.js";
import { buildCategoryMap, normalizeSeedCategory, normalizeSeedProduct } from "../utils/dataNormalization.js";

dotenv.config();

function assertSeedAllowed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed catalog in production");
  }

  if (!process.argv.includes("--yes")) {
    throw new Error("Refusing to reset catalog without --yes");
  }
}

const categories = [
  {
    id: 1,
    name: "Digital Products",
    slug: "digital-products",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop",
    description: "Keys, codes, accounts and manual digital services",
    icon: "software",
    sortOrder: 1,
  },
  {
    id: 11,
    name: "License Keys",
    slug: "license-keys",
    description: "Software and app license keys delivered after payment",
    icon: "key",
    parentId: 1,
    sortOrder: 1,
  },
  {
    id: 12,
    name: "Redeem Codes",
    slug: "redeem-codes",
    description: "Wallet, game and gift codes",
    icon: "games",
    parentId: 1,
    sortOrder: 2,
  },
  {
    id: 13,
    name: "Accounts",
    slug: "accounts",
    description: "Digital accounts and subscription credentials",
    icon: "user",
    parentId: 1,
    sortOrder: 3,
  },
  {
    id: 14,
    name: "Manual Services",
    slug: "manual-services",
    description: "Services processed by support after payment",
    icon: "support",
    parentId: 1,
    sortOrder: 4,
  },
  {
    id: 2,
    name: "Hardware",
    slug: "hardware",
    image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=1200&auto=format&fit=crop",
    description: "Computers, devices, components and accessories",
    icon: "hardware",
    sortOrder: 2,
  },
  {
    id: 21,
    name: "Computers",
    slug: "computers",
    description: "Laptops, mini PCs and desktops",
    icon: "hardware",
    parentId: 2,
    sortOrder: 1,
  },
  {
    id: 22,
    name: "Components",
    slug: "components",
    description: "SSD, RAM and upgrade parts",
    icon: "hardware",
    parentId: 2,
    sortOrder: 2,
  },
  {
    id: 23,
    name: "Accessories",
    slug: "accessories",
    description: "Keyboards, mice and daily peripherals",
    icon: "hardware",
    parentId: 2,
    sortOrder: 3,
  },
];

const products = [
  {
    id: 1,
    sku: "KEY-WIN11-PRO",
    name: "Windows 11 Pro License Key",
    description: "Retail activation key for one Windows 11 Pro device. Delivered after VNPay confirmation.",
    price: 59,
    discountPrice: 29,
    categoryId: 11,
    vendor: "Microsoft",
    badge: "HOT",
    productType: "license_key",
    deliveryType: "instant_key",
    keyPrefix: "WIN11",
    stock: 240,
    rating: 4.8,
    reviewsCount: 18,
    images: [
      "https://images.unsplash.com/photo-1633419461186-7d40a38105ec?q=80&w=1200&auto=format&fit=crop",
    ],
    attributes: {
      platform: "Windows",
      validity: "Lifetime activation",
      delivery: "Instant key after payment",
    },
  },
  {
    id: 2,
    sku: "KEY-KASP-1Y",
    name: "Kaspersky Premium Security 1 Year",
    description: "Activation key for Kaspersky Premium protection on PC and mobile devices.",
    price: 39,
    discountPrice: 19,
    categoryId: 11,
    vendor: "Kaspersky",
    badge: "SECURE",
    productType: "license_key",
    deliveryType: "instant_key",
    keyPrefix: "KASP",
    stock: 180,
    rating: 4.6,
    reviewsCount: 12,
    images: [
      "https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=1200&auto=format&fit=crop",
    ],
    attributes: {
      duration: "1 year",
      devices: "1 device",
    },
  },
  {
    id: 3,
    sku: "KEY-CERBERUS-PUBGM",
    name: "CERBERUS Bypass License Key",
    description: "License key for CERBERUS bypass. Supports selected PUBG Mobile regions and instant activation.",
    price: 39,
    discountPrice: 24,
    categoryId: 11,
    vendor: "CERBERUS",
    badge: "BYPASS",
    productType: "license_key",
    deliveryType: "instant_key",
    keyPrefix: "CERBERUS",
    stock: 120,
    rating: 4.7,
    reviewsCount: 26,
    images: ["/images/bypass/cerberus-banner.png"],
    attributes: {
      game: "PUBG Mobile",
      delivery: "License key",
    },
  },
  {
    id: 4,
    sku: "CODE-STEAM-20",
    name: "Steam Wallet Code $20",
    description: "Redeemable Steam Wallet code for games, DLC and in-game items.",
    price: 22,
    discountPrice: 20,
    categoryId: 12,
    vendor: "Steam",
    badge: "CODE",
    productType: "redeem_code",
    deliveryType: "instant_key",
    keyPrefix: "STEAM",
    stock: 300,
    rating: 4.9,
    reviewsCount: 44,
    images: [
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop",
    ],
  },
  {
    id: 5,
    sku: "CODE-GAME-GIFT",
    name: "Global Game Gift Code",
    description: "Digital gift code for supported game stores. Redeem instructions are included after payment.",
    price: 35,
    discountPrice: 29,
    categoryId: 12,
    vendor: "GamePass",
    badge: "GIFT",
    productType: "redeem_code",
    deliveryType: "instant_key",
    keyPrefix: "GIFT",
    stock: 160,
    rating: 4.5,
    reviewsCount: 10,
    images: [
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop",
    ],
  },
  {
    id: 6,
    sku: "ACC-O365-LIFE",
    name: "Office 365 Lifetime Account",
    description: "Microsoft Office account credentials delivered by support after payment verification.",
    price: 99,
    discountPrice: 49,
    categoryId: 13,
    vendor: "Microsoft",
    badge: "ACCOUNT",
    productType: "account",
    deliveryType: "account_credentials",
    stock: 80,
    rating: 4.4,
    reviewsCount: 21,
    images: [
      "https://images.unsplash.com/photo-1633419461186-7d40a38105ec?q=80&w=1200&auto=format&fit=crop",
    ],
    attributes: {
      delivery: "Account credentials",
      handlingTime: "Within 30 minutes",
    },
  },
  {
    id: 7,
    sku: "ACC-CANVA-PRO",
    name: "Canva Pro Team Account",
    description: "Canva Pro account access prepared manually by support after online payment.",
    price: 25,
    discountPrice: 15,
    categoryId: 13,
    vendor: "Canva",
    badge: "ACCOUNT",
    productType: "account",
    deliveryType: "account_credentials",
    stock: 70,
    rating: 4.3,
    reviewsCount: 9,
    images: [
      "https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=1200&auto=format&fit=crop",
    ],
  },
  {
    id: 8,
    sku: "SRV-ACTIVATION",
    name: "Remote Software Activation Support",
    description: "Support team helps activate eligible software remotely after VNPay payment.",
    price: 18,
    discountPrice: 12,
    categoryId: 14,
    vendor: "KEYSHOP Support",
    badge: "SERVICE",
    productType: "manual_service",
    deliveryType: "manual_delivery",
    stock: 50,
    rating: 4.6,
    reviewsCount: 7,
    images: [
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop",
    ],
    attributes: {
      handlingTime: "Same day",
      channel: "Ticket or email",
    },
  },
  {
    id: 9,
    sku: "SRV-PUBGM-CONFIG",
    name: "PUBG Mobile Emulator Config Service",
    description: "Manual setup service for emulator configuration and basic optimization.",
    price: 30,
    discountPrice: 19,
    categoryId: 14,
    vendor: "KEYSHOP Support",
    badge: "SERVICE",
    productType: "manual_service",
    deliveryType: "manual_delivery",
    stock: 40,
    rating: 4.5,
    reviewsCount: 14,
    images: ["/images/bypass/snake-app.png"],
  },
  {
    id: 10,
    sku: "HW-LAPTOP-AIR13",
    name: "Ultrabook Air 13 Refurbished",
    description: "Compact refurbished laptop for office work, study and light development. COD eligible.",
    price: 499,
    discountPrice: 429,
    categoryId: 21,
    vendor: "KEYSHOP Hardware",
    badge: "COD",
    productType: "hardware",
    deliveryType: "physical",
    requiresOnlinePayment: false,
    stock: 8,
    rating: 4.4,
    reviewsCount: 6,
    images: [
      "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?q=80&w=1200&auto=format&fit=crop",
    ],
    variants: [
      {
        id: "space-gray",
        name: "Space Gray",
        price: 429,
        listPrice: 499,
        color: "#4b5563",
      },
      {
        id: "silver",
        name: "Silver",
        price: 429,
        listPrice: 499,
        color: "#d1d5db",
      },
      {
        id: "midnight",
        name: "Midnight",
        price: 449,
        listPrice: 519,
        color: "#111827",
      },
    ],
    weight: 1.3,
    dimensions: { length: 30, width: 21, height: 2 },
  },
  {
    id: 11,
    sku: "HW-SSD-1TB",
    name: "NVMe SSD 1TB",
    description: "High-speed 1TB NVMe SSD upgrade for laptops and desktops. COD eligible.",
    price: 89,
    discountPrice: 69,
    categoryId: 22,
    vendor: "KingSpec",
    badge: "COD",
    productType: "hardware",
    deliveryType: "physical",
    requiresOnlinePayment: false,
    stock: 24,
    rating: 4.7,
    reviewsCount: 16,
    images: [
      "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?q=80&w=1200&auto=format&fit=crop",
    ],
    variants: [
      {
        id: "black",
        name: "Black",
        price: 69,
        listPrice: 89,
        color: "#111827",
      },
      {
        id: "blue",
        name: "Blue",
        price: 72,
        listPrice: 92,
        color: "#2563eb",
      },
      {
        id: "silver",
        name: "Silver",
        price: 75,
        listPrice: 95,
        color: "#d1d5db",
      },
    ],
    weight: 0.08,
  },
  {
    id: 12,
    sku: "HW-KB-MECH",
    name: "Compact Mechanical Keyboard",
    description: "Hot-swappable compact mechanical keyboard for gaming and productivity. COD eligible.",
    price: 79,
    discountPrice: 59,
    categoryId: 23,
    vendor: "KeyLab",
    badge: "COD",
    productType: "hardware",
    deliveryType: "physical",
    requiresOnlinePayment: false,
    stock: 18,
    rating: 4.6,
    reviewsCount: 13,
    images: [
      "https://images.unsplash.com/photo-1587829741301-dc798b83add3?q=80&w=1200&auto=format&fit=crop",
    ],
    variants: [
      {
        id: "black",
        name: "Black",
        price: 59,
        listPrice: 79,
        color: "#111827",
      },
      {
        id: "white",
        name: "White",
        price: 59,
        listPrice: 79,
        color: "#f8fafc",
      },
      {
        id: "pink",
        name: "Pink",
        price: 64,
        listPrice: 84,
        color: "#f9a8d4",
      },
    ],
    weight: 0.7,
  },
];

const coupons = [
  {
    code: "WELCOME10",
    type: "percent",
    value: 10,
    minOrder: 20,
    maxDiscount: 20,
    usageLimit: 200,
    expiresAt: new Date("2027-12-31T23:59:59.000Z"),
  },
  {
    code: "DIGITAL5",
    type: "fixed",
    value: 5,
    minOrder: 25,
    usageLimit: 150,
    expiresAt: new Date("2027-12-31T23:59:59.000Z"),
  },
  {
    code: "HARDWARE15",
    type: "percent",
    value: 15,
    minOrder: 100,
    maxDiscount: 60,
    usageLimit: 80,
    expiresAt: new Date("2027-12-31T23:59:59.000Z"),
  },
];

const banners = [
  {
    title: "Instant keys after VNPay",
    subtitle: "License keys and redeem codes are delivered only after payment confirmation.",
    image: "/images/bypass/cerberus-banner.png",
    link: "/productListing?category=license-keys",
    placement: "home_slider",
    sortOrder: 1,
  },
  {
    title: "Digital accounts handled safely",
    subtitle: "Account products are prepared by support after online payment.",
    image: "https://images.unsplash.com/photo-1633419461186-7d40a38105ec?q=80&w=1200&auto=format&fit=crop",
    link: "/productListing?category=accounts",
    placement: "home_slider",
    sortOrder: 2,
  },
  {
    title: "Hardware supports COD",
    subtitle: "Computers, components and accessories can use VNPay or COD.",
    image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=1200&auto=format&fit=crop",
    link: "/productListing?category=hardware",
    placement: "ads",
    sortOrder: 1,
  },
];

const blogs = [
  {
    title: "How digital delivery works",
    description: "Keys and codes are shown only after confirmed online payment to keep delivery safe.",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop",
    category: "Guide",
  },
  {
    title: "Key, code, account and service: what is different?",
    description: "A short guide explaining each product group and how customers receive it.",
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=1200&auto=format&fit=crop",
    category: "Guide",
  },
  {
    title: "When COD is available",
    description: "COD is available for physical hardware only; digital items require VNPay.",
    image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=1200&auto=format&fit=crop",
    category: "Policy",
  },
];

async function resetCollections() {
  await Promise.all([
    ProductModel.deleteMany({}),
    CategoryModel.deleteMany({}),
    CouponModel.deleteMany({}),
    BannerModel.deleteMany({}),
    BlogModel.deleteMany({}),
    ReviewModel.deleteMany({}),
  ]);
}

async function seed() {
  assertSeedAllowed();

  if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL is required");
  }

  await mongoose.connect(process.env.MONGODB_URL);

  await resetCollections();

  const normalizedCategories = categories.map(normalizeSeedCategory);
  await CategoryModel.insertMany(normalizedCategories);

  const categoryMap = buildCategoryMap(normalizedCategories);
  const normalizedProducts = products.map((product) =>
    normalizeSeedProduct(product, categoryMap),
  );

  await ProductModel.insertMany(normalizedProducts);
  await CouponModel.insertMany(coupons);
  await BannerModel.insertMany(banners);
  await BlogModel.insertMany(blogs);

  console.log("Catalog seed complete");
  console.log(`Categories: ${normalizedCategories.length}`);
  console.log(`Products: ${normalizedProducts.length}`);
  console.log(`Coupons: ${coupons.length}`);
  console.log(`Banners: ${banners.length}`);
  console.log(`Blogs: ${blogs.length}`);
}

seed()
  .catch((error) => {
    console.error("Catalog seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
