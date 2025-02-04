import businessService from "../services/businesses.service";

const addBusiness = async (req, res) => {
  try {
    const data = req.body;
    const email = req.user.email;

    const response = await businessService.addBusinesses(data, email);
    res.status(201).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const businessController = {
  addBusiness,
};

export default businessController;
