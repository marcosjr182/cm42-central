class Activity < ActiveRecord::Base
  include Central::Support::ActivityConcern::Associations
  include Central::Support::ActivityConcern::Validations
  include Central::Support::ActivityConcern::Callbacks
  include Central::Support::ActivityConcern::Scopes

  scope :by_story, ->(story) { where(subject_id: story, subject_type: 'Story') }

  def decorate
    ActivityPresenter.new(self)
  end
end
