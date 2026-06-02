import crypto from "crypto";

function sortObject(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      result[key] = obj[key];
      return result;
    }, {});
}

function encodeVnpayValue(value) {
  return encodeURIComponent(String(value)).replace(/%20/g, "+");
}

function buildSignData(params) {
  return Object.keys(params)
    .map((key) => `${encodeVnpayValue(key)}=${encodeVnpayValue(params[key])}`)
    .join("&");
}

export function getVnpayExchangeRate() {
  const configuredRate = Number(process.env.VNPAY_EXCHANGE_RATE);

  return Number.isFinite(configuredRate) && configuredRate > 0
    ? configuredRate
    : 25000;
}

export function toVnpayAmount(amount) {
  return Math.round(Number(amount || 0) * getVnpayExchangeRate() * 100);
}

export function createVNPayUrl({ orderId, amount, clientIp = "127.0.0.1" }) {
  const tmnCode = process.env.VNPAY_TMN_CODE;
  const secret = process.env.VNPAY_HASH_SECRET;
  const paymentUrl =
    process.env.VNPAY_PAYMENT_URL ||
    "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";

  if (!tmnCode || !secret) {
    throw new Error("VNPay credentials are not configured");
  }

  const vnpParams = {
    vnp_Amount: toVnpayAmount(amount),
    vnp_Command: "pay",
    vnp_CreateDate: new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14),
    vnp_CurrCode: "VND",
    vnp_IpAddr: clientIp,
    vnp_Locale: "vn",
    vnp_OrderInfo: `Thanh toan don hang ${orderId}`,
    vnp_OrderType: "billpayment",
    vnp_ReturnUrl: `${process.env.API_URL}/api/payments/vnpay-return`,
    vnp_TmnCode: tmnCode,
    vnp_TxnRef: orderId,
    vnp_Version: "2.1.0",
  };

  const sorted = sortObject(vnpParams);
  const secureHash = crypto
    .createHmac("sha512", secret)
    .update(buildSignData(sorted), "utf-8")
    .digest("hex");

  const query = new URLSearchParams(sorted);
  query.append("vnp_SecureHash", secureHash);

  return `${paymentUrl}?${query.toString()}`;
}

export function verifyVNPay(query) {
  const secret = process.env.VNPAY_HASH_SECRET;

  if (!secret) {
    return false;
  }

  const data = { ...query };
  const secureHash = data.vnp_SecureHash;

  delete data.vnp_SecureHash;
  delete data.vnp_SecureHashType;

  const hash = crypto
    .createHmac("sha512", secret)
    .update(buildSignData(sortObject(data)), "utf-8")
    .digest("hex");

  return hash === secureHash;
}
