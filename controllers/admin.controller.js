import UserModel from "../models/user.model.js";
import ProductModel from "../models/product.model.js";
import OrderModel from "../models/order.model.js";
import CategoryModel from "../models/category.model.js";
import CouponModel from "../models/coupon.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getDashboardStats = asyncHandler(async (request, response) => {
  const [
    users,
    products,
    orders,
    categories,
    coupons,
    revenueAgg,
    recentOrders,
  ] = await Promise.all([
    UserModel.countDocuments(),
    ProductModel.countDocuments({ isActive: true }),
    OrderModel.countDocuments(),
    CategoryModel.countDocuments({ isActive: true }),
    CouponModel.countDocuments({ isActive: true }),
    OrderModel.aggregate([
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    OrderModel.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select("orderId total status email paymentMethod createdAt"),
  ]);

  response.json({
    users,
    products,
    orders,
    categories,
    coupons,
    revenue: revenueAgg[0]?.total || 0,
    recentOrders: recentOrders.map((order) => ({
      id: order.orderId,
      total: order.total,
      status: order.status,
      email: order.email,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
    })),
  });
});
