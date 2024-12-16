const { Router } = require('express');
const userController = require('../controllers/user.controller.js');

const router = Router();

/* GET users listing. */
router.get('/', userController.list);

router.post('/table', tableList);

router.get('/getMyUser', userController.getMyUser);

router.post('/checkPermission', userController.checkUserPermission);
    
router.route('/:userId',)
    .get(userController.read)
    .put(userController.update);

router.put('/changepassword/:userId', userController.changePassword)


/* Define all params */
router.param('userId', userController.userByID);


module.exports = router;