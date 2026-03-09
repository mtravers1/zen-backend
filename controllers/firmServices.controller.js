import FirmService from "../database/models/FirmService.js";
import ClientService from "../database/models/ClientService.js";

// ─── Firm Services (service catalog) ─────────────────────────────────────────

const getFirmServices = async (req, res) => {
  try {
    const { category, isActive = "true" } = req.query;
    const filter = { deleted: false };
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const services = await FirmService.find(filter).sort({ category: 1, name: 1 }).lean();
    res.status(200).json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getFirmService = async (req, res) => {
  try {
    const service = await FirmService.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.status(200).json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createFirmService = async (req, res) => {
  try {
    const service = await FirmService.create({ ...req.body, createdById: req.user?.userId });
    res.status(201).json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateFirmService = async (req, res) => {
  try {
    const service = await FirmService.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.status(200).json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteFirmService = async (req, res) => {
  try {
    const service = await FirmService.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.status(200).json({ message: "Service deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Client Services (services assigned to clients / portal view) ─────────────

const getClientServices = async (req, res) => {
  try {
    const { clientId, status } = req.query;
    const filter = { deleted: false };
    if (clientId) filter.clientId = clientId;
    if (status) filter.status = status;

    const clientServices = await ClientService.find(filter)
      .populate("serviceId", "name short_description category price pricingModel")
      .sort({ purchasedAt: -1 })
      .lean();
    res.status(200).json(clientServices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const assignClientService = async (req, res) => {
  try {
    const cs = await ClientService.create(req.body);
    const populated = await ClientService.findById(cs._id)
      .populate("serviceId", "name short_description category price pricingModel")
      .lean();
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateClientService = async (req, res) => {
  try {
    const cs = await ClientService.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).populate("serviceId", "name short_description category").lean();
    if (!cs) return res.status(404).json({ message: "Client service not found" });
    res.status(200).json(cs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const firmServicesController = {
  getFirmServices, getFirmService, createFirmService, updateFirmService, deleteFirmService,
  getClientServices, assignClientService, updateClientService,
};
export default firmServicesController;
