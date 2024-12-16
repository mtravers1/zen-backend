const _ = require('underscore');
const permissionHelper = require('../lib/permissionHelper.js');
const dataTableHelper = require('../lib/dataTableHelper.js');

/**
 * Search by id
 */
function userByID(req, res, next, id) {
    // TODO: Implement userByID logic

    // dbcontext.User.findOne({
    //     _id: id,
    //     deleted: false
    // }).populate('role').populate('group').exec(function (error, user) {
    //     if (error) {
    //         res.status(400).send(error);
    //     } else {
    //         req.userById = user;
    //         next();
    //     }
    // });

    res.status(200).send("Success");
};

/**
 * Create a User
 */
async function create(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, "userModule");
    if (!authorized) {
        res.status(401).send("Unauthorized");
        return;
    }

    let user = req.body;
    const roles = _.pluck(user.roles, 'id');

    const newUser = new dbcontext.User(user);
    newUser.save().then(function (user) {
        user.setRoles(roles);
        res.json(user);
    }).catch(function (error) {
        res.status(400).send(error);
    });
};

/**
 * Show the current User
 */
async function read(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, "userModule");
    if (!authorized) {
        res.status(401).send("Unauthorized");
        return;
    }

    let user = {};

    if (req.userById) {
        user = req.userById.toJSON();
        delete user.password;
    }
    res.jsonp(user);
};

/**
 * Update a User
 */
async function update(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, "userModule");
    if (!authorized) {
        res.status(401).send("Unauthorized");
        return;
    }

    let user = req.userById;
    delete req.body.userId;

    if (user.password === '') {
        delete req.body.password;
    }

    user = _.extend(user, req.body);

    const role = req.body.roleId;

    user.save(user).then(function (user) {
        user.setRole(role).then(user => {
            res.send(user);
        }).catch(error => {
            res.status(400).send(error);
        });
    }).catch(function (error) {
        res.status(400).send(error);
    });
};

/**
 * Delete a User
 */
async function deleteUser(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, "userModule");
    if (!authorized) {
        res.status(401).send("Unauthorized");
        return;
    }

    let user = req.userById;
    user.deleted = true;

    user.save(user).then(function (user) {
        res.send(user);
    }).catch(function (error) {
        res.status(400).send(error);
    });
};

/**
 * List of Users
 */
async function list(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, "userModule");
    if (!authorized) {
        res.status(401).send("Unauthorized");
        return;
    }

    dbcontext.User.findAll({
        where: {
            deleted: false
        },
        order: [
            ['code', 'ASC']
        ],
        include: [
            {
                model: dbcontext.role,
                as: 'role'
            },
            {
                model: dbcontext.Group,
                as: 'group'
            }
        ],
    }).then(function (users) {
        _.each(users, function (user) {
            user.password = '';
        });
        res.json(users);
    }).catch(function (error) {
        res.status(400).send(error);
    });
};

/**
 * List of Users for Table
 */
async function tableList(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, "userModule");
    if (!authorized) {
        res.status(401).send("Unauthorized");
        return;
    }

    const requestData = req.body;

    const Sequelize = dbcontext.sequelize;

    const dataTableParams = dataTableHelper.getDataTableFilterParams(dbcontext, 'User', requestData);

    dbcontext.User.findAndCountAll({
        where: Sequelize.and(
            dataTableParams.filters.concat(
                {deleted: false}
            )
        ),
        include: [
            {
                model: dbcontext.role,
                as: 'role'
            },
            {
                model: dbcontext.Group,
                as: 'group'
            }
        ],
        order: dataTableParams.orderBy.concat(
            ['code']
        ),
        offset: dataTableParams.offset,
        limit: dataTableParams.numberOfRows
    }).then(function (lengthData) {
        dataTableHelper.addRowNumber(lengthData, dataTableParams);
        _.each(lengthData.rows, function (user) {
            user.password = '';
        });
        res.json({
            lengthData: lengthData,
        });
    }).catch(function (error) {
        res.status(400).send(error);
    });
};

/**
 * Get Session User
 */
function getMyUser(req, res) {
    dbcontext.User.findOne({
        where: {
            id: req.user.userId,
            deleted: false
        },
        include: [
            {
                model: dbcontext.role,
                as: 'role'
            },
            {
                model: dbcontext.Group,
                as: 'group'
            }
        ],
    }).then(function (user) {
        user.password = '';
        res.json(user);
    }).catch(function (error) {
        res.status(400).send(error);
    });
};

/**
 *  Get Permission Validation
 */

async function checkUserPermission(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, req.body.permissionName);
    res.send(authorized);
};

function changePassword(req, res) {
    const passwords = req.body;
    dbcontext.User.findOne({
        where: {
            id: req.user.userId,
            deleted: false
        }
    }).then(function (user) {
        user.authenticate(passwords.password).then(result => {
            if (result) {
                user.password = passwords.newPassword;
                user.save().then(function (user) {
                    res.send(user);
                }).catch(function (error) {
                    res.status(400).send(error);
                });
            } else {
                res.status(401).send('No autorizado.');
            }
        });
    }).catch(function (error) {
        res.status(400).send(error);
    });
};

module.exports = {
    list,
    create,
    tableList,
    read,
    update,
    userByID,
    deleteUser,
    getMyUser,
    checkUserPermission,
    changePassword
};