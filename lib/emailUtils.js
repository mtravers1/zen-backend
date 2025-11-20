export const redactEmail = (email) => {
  if (!email || !email.includes('@')) {
    return email;
  }
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 3) {
    return `${localPart.slice(0, 1)}...*@*${domain}`;
  }
  return `${localPart.slice(0, 3)}...*@*${domain}`;
};
