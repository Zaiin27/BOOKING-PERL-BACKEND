const sendToken = (user, statusCode, res) => {
  const token = user.getJWTToken();

  const options = {
    expires: new Date(
      Date.now() + process.env.COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  // Ensure paymentType is included in user object
  const userObject = user.toObject ? user.toObject() : user;
  if (!userObject.paymentType) {
    userObject.paymentType = user.paymentType || "both";
  }

  res.status(statusCode).cookie("authToken", token, options).json({
    success: true,
    user: userObject,
    token,
  });
};

export default sendToken;
