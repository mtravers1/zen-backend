import FirmSettings from "../database/models/FirmSettings.js";
import User from "../database/models/User.js";
import { getUserDek, decryptValue } from "../database/encryption.js";

// GET /api/settings/firm
export const getFirmSettings = async (req, res) => {
  try {
    const { firmId } = req.query;
    if (!firmId) return res.status(400).json({ error: "firmId is required" });

    let settings = await FirmSettings.findOne({ firmId });
    if (!settings) {
      // Create default settings
      settings = await FirmSettings.create({ firmId });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/settings/firm
export const updateFirmSettings = async (req, res) => {
  try {
    const { firmId } = req.body;
    if (!firmId) return res.status(400).json({ error: "firmId is required" });

    const settings = await FirmSettings.findOneAndUpdate(
      { firmId },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/settings/team
export const getTeamMembers = async (req, res) => {
  try {
    const users = await User.find({ deleted: { $ne: true } })
      .select("-password")
      .sort({ createdAt: -1 });

    // Decrypt user details
    const formatted = [];
    for (const user of users) {
      try {
        const dek = await getUserDek(user.authUid);
        let email = "N/A";
        let firstName = "N/A";
        let lastName = "N/A";
        if (user.email && user.email.length > 0) {
          email = await decryptValue(user.email[0].email, dek).catch(() => "N/A");
        }
        if (user.name) {
          firstName = await decryptValue(user.name.firstName, dek).catch(() => "N/A");
          lastName = user.name.lastName ? await decryptValue(user.name.lastName, dek).catch(() => "") : "";
        }
        formatted.push({
          _id: user._id,
          email,
          firstName,
          lastName,
          role: user.role,
          method: user.method,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        });
      } catch (_) {
        formatted.push({ _id: user._id, role: user.role, createdAt: user.createdAt });
      }
    }

    res.status(200).json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/settings/integrations
export const getIntegrations = async (req, res) => {
  try {
    const { firmId } = req.query;
    const settings = firmId ? await FirmSettings.findOne({ firmId }).select("integrations") : null;
    res.status(200).json(settings?.integrations || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/settings/integrations
export const updateIntegration = async (req, res) => {
  try {
    const { firmId, integration, ...data } = req.body;
    const updatePath = `integrations.${integration}`;
    const settings = await FirmSettings.findOneAndUpdate(
      { firmId },
      { $set: { [updatePath]: data } },
      { new: true, upsert: true }
    );
    res.status(200).json(settings.integrations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/settings/billing
export const getBillingSettings = async (req, res) => {
  try {
    const { firmId } = req.query;
    const settings = await FirmSettings.findOne({ firmId }).select(
      "invoicePrefix invoiceStartNumber invoiceFooterNote defaultPaymentTerms defaultTaxRate currency proposalPrefix proposalStartNumber defaultProposalExpiry"
    );
    res.status(200).json(settings || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/settings/billing
export const updateBillingSettings = async (req, res) => {
  try {
    const { firmId } = req.body;
    const settings = await FirmSettings.findOneAndUpdate(
      { firmId },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/settings/client-portal
export const getClientPortalSettings = async (req, res) => {
  try {
    const { firmId } = req.query;
    const settings = await FirmSettings.findOne({ firmId }).select(
      "clientPortalEnabled clientPortalSubdomain clientPortalCustomDomain clientSignupEnabled clientSignupFields"
    );
    res.status(200).json(settings || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/settings/client-portal
export const updateClientPortalSettings = async (req, res) => {
  try {
    const { firmId } = req.body;
    const settings = await FirmSettings.findOneAndUpdate(
      { firmId },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
