'use strict';

/**
 * Middleware: Require authenticated Discord user.
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect('/auth/discord');
  }
  next();
}

/**
 * Middleware: Require bot owner authentication.
 */
function requireOwner(req, res, next) {
  if (!req.user || req.user.id !== process.env.BOT_OWNER_ID) {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'This area is restricted to the bot owner.',
    });
  }
  next();
}

/**
 * Middleware: Require user to have Manage Guild perm in a guild.
 */
function requireGuildAdmin(req, res, next) {
  const { guildId } = req.params;
  if (!req.user) return res.redirect('/auth/discord');

  const guild = req.user.guilds?.find(
    (g) => g.id === guildId && (parseInt(g.permissions) & 0x20) === 0x20
  );

  if (!guild) {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'You need Manage Server permissions to access this panel.',
    });
  }

  next();
}

module.exports = { requireAuth, requireOwner, requireGuildAdmin };
