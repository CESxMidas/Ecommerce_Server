import crypto from "crypto";

/* ========================= */
/* SORT OBJECT */
/* ========================= */
function sortObject(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      result[key] = obj[key];
      return result;
    }, {});
}

/* ========================= */
/* CREATE VNPay URL */
/* ========================= */
export function createVNPayUrl({ orderId, amount }) {
  const tmnCode = process.env.VNPAY_TMN_CODE;
  const secret = process.env.VNPAY_HASH_SECRET;

  // 1. Quy đổi từ tiền USD sang VND (Ví dụ: 12 * 25000 = 300000)
  const amountInVnd = Math.round(amount * 25000);

  const vnp_Params = {
    // 2. BẮT BUỘC: Lấy số tiền VND nhân tiếp với 100 theo đúng tài liệu VNPay
    vnp_Amount: Math.round(amountInVnd * 100),
    vnp_Command: "pay",
    vnp_CreateDate: new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14),
    vnp_CurrCode: "VND",
    vnp_IpAddr: "127.0.0.1",
    vnp_Locale: "vn",
    vnp_OrderInfo: `Thanh toan don hang ${orderId}`,
    vnp_OrderType: "billpayment",
    vnp_ReturnUrl: `${process.env.API_URL}/api/payments/vnpay-return`,
    vnp_TmnCode: tmnCode,
    vnp_TxnRef: orderId,
    vnp_Version: "2.1.0",
  };

  // 1. Sắp xếp tham số theo alphabet
  const sorted = sortObject(vnp_Params);

  // 2. Mã hóa đúng chuẩn VNPay
  const signData = Object.keys(sorted)
    .map((key) => {
      const encodedKey = encodeURIComponent(key).replace(/%20/g, "+");
      const encodedValue = encodeURIComponent(String(sorted[key])).replace(
        /%20/g,
        "+",
      );
      return `${encodedKey}=${encodedValue}`;
    })
    .join("&");

  // 3. Tạo chữ ký bảo mật
  const secureHash = crypto
    .createHmac("sha512", secret)
    .update(signData, "utf-8")
    .digest("hex");

  // 4. Tạo URL gửi đi
  const query = new URLSearchParams(sorted);
  query.append("vnp_SecureHash", secureHash);

  return `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?${query.toString()}`;
}

/* ========================= */
/* VERIFY VNPay */
/* ========================= */
export function verifyVNPay(query) {
  const secret = process.env.VNPAY_HASH_SECRET;

  const data = { ...query };
  const secureHash = data.vnp_SecureHash;

  // Xóa các tham số mã hóa ra khỏi dữ liệu băm ngược
  delete data.vnp_SecureHash;
  delete data.vnp_SecureHashType;

  const sorted = sortObject(data);

  // Áp dụng logic mã hóa tương tự lúc gửi đi để kiểm tra tính toàn vẹn
  const signData = Object.keys(sorted)
    .map((key) => {
      const encodedKey = encodeURIComponent(key).replace(/%20/g, "+");
      const encodedValue = encodeURIComponent(String(sorted[key])).replace(
        /%20/g,
        "+",
      );
      return `${encodedKey}=${encodedValue}`;
    })
    .join("&");

  const hash = crypto
    .createHmac("sha512", secret)
    .update(signData, "utf-8")
    .digest("hex");

  return hash === secureHash;
}
