import jwt from "jsonwebtoken";

export default function webTokenDecoder(token) {
  return jwt.decode(token);
}
