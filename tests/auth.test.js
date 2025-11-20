import { jest } from "@jest/globals";
import authService from "../services/auth.service.js";

describe("Auth Service", () => {
  describe("validateOAuthToken", () => {
    it("should return an error for an invalid provider", async () => {
      const result = await authService.validateOAuthToken(
        "invalid",
        "fake-token",
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("Unsupported OAuth provider: invalid");
    });
  });
});
