module.exports = Backbone.Model.extend({
  name: 'activity',

  i18nScope: 'activerecord.attributes.',

  timestampFormat: 'd mmm yyyy',

  initialize: function(args) {
    var attributes = this.attributes;
    var data = args.activity;

    this.i18nScope += data.subject_type.toLowerCase();
    attributes.date = new Date(data.updated_at).format(this.timestampFormat);
    attributes.action = this.humanActionName(data.action);
    attributes.subject_changes = this.parseChanges(data.subject_changes);
  },

  humanActionName: function(action) {
    return I18n.t(action, {scope: 'activity.actions'});
  },

  parseChanges: function(changes) {
    return _.map(changes, function(value, key) {
      return {
        attribute: I18n.t(key, {scope: this.i18nScope}),
        oldValue: value[0],
        newValue: value[1]
      }
    }, this);
  }

});
