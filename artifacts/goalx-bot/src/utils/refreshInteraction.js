'use strict';

/**
 * Creates a proxy Interaction that allows a command's `execute` method to be
 * re-run from a Button interaction. Used by the generic refresh handler in
 * InteractionHandler.
 */
function refreshInteraction(interaction) {
  return new Proxy(interaction, {
    get(target, prop) {
      if (prop === 'deferReply') return async () => target.deferUpdate();
      if (prop === 'editReply') return async (...args) => target.editReply(...args);
      if (prop === 'reply') return async (...args) => target.editReply(...args);
      if (prop === 'followUp') return async (...args) => target.followUp(...args);
      if (prop === 'deferred') return true;
      if (prop === 'replied') return target.replied;
      if (prop === 'commandName') return target.customId?.split(':')[1] || target.commandName;
      if (prop === 'command') return target.command;
      if (prop === 'options') {
        return {
          data: [],
          getString: () => null,
          getInteger: () => null,
          getNumber: () => null,
          getBoolean: () => null,
          getUser: () => target.user,
          getMember: () => null,
          getChannel: () => null,
          getRole: () => null,
          getSubcommand: () => null,
          getSubcommandGroup: () => null,
        };
      }
      return target[prop];
    },
  });
}

module.exports = { refreshInteraction };
