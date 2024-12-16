const _ = require('underscore');
const permissionHelper = require('../lib/permissionHelper.js');
const dataTableHelper = require('../lib/dataTableHelper.mjs');

/**
 * role middleware
 */
function roleByID(req, res, next, id) {
    dbcontext.role.find({
        where: {
            id: id,
            deleted: false
        },
    }).then(function (role) {
        req.role = role;
        next()
    }).catch(function (error) {
        res.status(400).send(error);
    });
};

/**
 * Create a role
 */
async function create(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, "roleModule");
    if(!authorized){
        res.status(401).send("Unauthorized");
        return;
    }

    let role = req.body;

    //Set Current User
    role.createdById = req.user.userId;
    role.updatedById = req.user.userId;
    
    dbcontext.role.create(role).then(function (role) {
        res.json(role);
    }).catch(function (error) {
        res.status(400).send(error);
    });
};

/**
 * Show the current role
 */
async function read(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, "roleModule");
    if(!authorized){
        res.status(401).send("Unauthorized");
        return;
    }

    const role = req.role ? req.role.toJSON() : {};
    res.jsonp(role);
};

/**
 * Update a role
 */
async function update(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, "roleModule");
    if(!authorized){
        res.status(401).send("Unauthorized");
        return;
    }

    let role = req.role;

    delete req.body.roleId;

    //Set Current User
    role.updatedById = req.user.userId;

    role = _.extend(role, req.body);
    role.save().then(function (role) {
        res.json(role);
    }).catch(function (error) {
        res.status(400).send(error);
        console.log(error);
    });
};

/**
 * Delete a role
 */
async function deleteUser(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, "roleModule");
    if(!authorized){
        res.status(401).send("Unauthorized");
        return;
    }

    let role = req.role;
    role.deleted = true;

    //Set Current User
    role.updatedById = req.user.userId;

    role.save().then(function (role) {
        res.send(role);
    }).catch(function (error) {
        res.status(400).send(error);
    });
};

/**
 * List of roles
 */
async function list(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, "roleModule");
    if(!authorized){
        res.status(401).send("Unauthorized");
        return;
    }

    dbcontext.role.findAll({
        where: {
            deleted: false
        }
    }).then(function (roles) {
    res.json(roles);
    }).catch(function (error) {
        res.status(400).send(error);
    });
};

/**
 * List of Roles for Table
 */
async function tableList(req, res) {
    const authorized = await permissionHelper.checkPermissions(req.user.userId, "roleModule");
    if (!authorized) {
        res.status(401).send("Unauthorized");
        return;
    }

    const requestData = req.body;

    const Sequelize = dbcontext.sequelize;

    const dataTableParams = dataTableHelper.getDataTableFilterParams(dbcontext, 'role', requestData);

    dbcontext.role.findAndCountAll({
        where: Sequelize.and(
            dataTableParams.filters.concat(
                { deleted: false }
            )
        ),
        order: dataTableParams.orderBy,
        offset: dataTableParams.offset,
        limit: dataTableParams.numberOfRows
    }).then(function (lengthData) {
        dataTableHelper.addRowNumber(lengthData, dataTableParams);
        res.json({
            lengthData: lengthData,
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
    roleByID, 
    deleteUser 
};