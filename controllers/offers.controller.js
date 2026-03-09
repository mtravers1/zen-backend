import Offer from "../database/models/Offer.js";

const getOffers = async (req, res) => {
  try {
    const { category, isActive = "true" } = req.query;
    const filter = { deleted: false };
    if (category && category !== "All") filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const offers = await Offer.find(filter).sort({ category: 1, title: 1 }).lean();
    res.status(200).json(offers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getOffer = async (req, res) => {
  try {
    const offer = await Offer.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.status(200).json(offer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createOffer = async (req, res) => {
  try {
    const offer = await Offer.create(req.body);
    res.status(201).json(offer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateOffer = async (req, res) => {
  try {
    const offer = await Offer.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.status(200).json(offer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findOneAndUpdate(
      { _id: req.params.id, deleted: false },
      { deleted: true },
      { new: true }
    );
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.status(200).json({ message: "Offer deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const offersController = { getOffers, getOffer, createOffer, updateOffer, deleteOffer };
export default offersController;
