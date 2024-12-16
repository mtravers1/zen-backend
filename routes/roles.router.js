const { Router } = require('express');
const roleController = require('../controllers/role.controller.js');

const router = Router();

router.route('/')
    .get(roleController.list)
    .post(roleController.create);

router.route('/table')
    .post(roleController.tableList);

router.route('/:roleId')
    .get(roleController.read)
    .put(roleController.update)
    .delete(roleController.deleteUser);

router.param('roleId', roleController.roleByID);

module.exports = router;