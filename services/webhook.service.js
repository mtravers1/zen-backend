const webhookHandler = (event) => {
  console.log(event);
  return "Webhook received";
};

const webhookService = {
  webhookHandler,
};

export default webhookService;
