export function notFound(request, response, next) {
  response.status(404).json({
    message: `Route not found: ${request.method} ${request.originalUrl}`,
  });
}

export function errorHandler(error, request, response, next) {
  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || "Internal server error";

  if (error.code === 11000) {
    return response.status(409).json({
      message: "Duplicate entry",
    });
  }

  if (process.env.NODE_ENV !== "production") {
    console.error(error);
  }

  response.status(statusCode).json({
    message,
    ...(error.details || {}),
  });
}
