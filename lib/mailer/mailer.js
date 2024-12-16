const { createTransport } = require('nodemailer');
const { createReadStream } = require('fs');

let smtpConfig = {
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: process.env.MAIL_SECURE,
    auth: {
        user: process.env.MAIL_AUTH_USER,
        pass: process.env.MAIL_AUTH_PASS
    }
};

let transporter = createTransport(smtpConfig);

function sendEmail (user, subject, template, jsonParams) {
    return new Promise((resolve, reject) => {
        const htmlstream = createReadStream(`${__dirname}/templates/${template}.html`);
        let html = '';
        htmlstream.on('data', chunk => html += chunk);
        htmlstream.on('end', () => {
            Object.keys(jsonParams).forEach(function (k) {
                html = html.replace("{{" + k + "}}", jsonParams[k]);
            });
            htmlstream.close();
            const message = {
                from: mailer.auth.user,
                to: user.email,
                subject: subject,
                html: html
            };
            transporter.sendMail(message, function (err, info) {
                if (err) {
                    reject(err);
                } else {
                    resolve(info);
                }
            });
        });
    });
}

module.exports = { sendEmail };