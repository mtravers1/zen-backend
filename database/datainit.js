const User = require('./models/user.js');
const Role = require('./models/role.js');
const UserRole = require('./models/userRole.js');

async function initialize() {
    console.log('Initializing MongoDB data...');
    try {
        let adminUser;
        let adminRole;
        let adminUserRole;
        const users = await User.find();
        if (users.length === 0) {
            adminUser = new User({
                username: "admin",
                name: "Zentavos Admin",
                email: "admin@zentavos.com",
                password: "admin"
            });

            await adminUser.save();
            console.log('Admin user created');
        }

        const roles = await Role.find();
        if (roles.length === 0) {
            adminRole = new Role({
                name: "admin",
                description: "Administrator role with full permissions"
            });

            await adminRole.save();
            console.log('Admin role created');
        }

        const userRoles = await UserRole.find();
        if (userRoles.length === 0) {
            adminUserRole = new UserRole({
                userId: adminUser._id,
                roleId: adminRole._id,
            });

            await adminUserRole.save();
            console.log('Admin user role created');
        }

        console.log('MongoDB data initialization complete.');
    } catch (error) {
        console.error('Error while initializing MongoDB data.\n' + error);
    }
}

module.exports = initialize;