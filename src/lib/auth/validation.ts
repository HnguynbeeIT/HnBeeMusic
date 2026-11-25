const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const username = normalizeUsername(raw);
  if (username.length < 3) {
    return "Tên đăng nhập phải có ít nhất 3 ký tự.";
  }
  if (username.length > 24) {
    return "Tên đăng nhập tối đa 24 ký tự.";
  }
  if (!USERNAME_REGEX.test(username)) {
    return "Tên đăng nhập chỉ gồm chữ thường (a-z), số (0-9) và dấu gạch dưới (_).";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password || password.length < 6) {
    return "Mật khẩu phải có ít nhất 6 ký tự.";
  }
  if (password.length > 128) {
    return "Mật khẩu quá dài.";
  }
  return null;
}
