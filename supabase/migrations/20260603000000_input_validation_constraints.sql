-- Guard direct database writes with the same practical limits enforced in the app.
-- NOT VALID avoids failing on legacy rows while still enforcing new inserts/updates.

create or replace function public._add_input_check_constraint(
  p_table_name text,
  p_column_name text,
  p_constraint_name text,
  p_check_sql text
) returns void
language plpgsql
as $$
begin
  if to_regclass('public.' || p_table_name) is null then
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table_name
      and column_name = p_column_name
  ) then
    return;
  end if;

  begin
    execute format(
      'alter table public.%I add constraint %I check (%s) not valid',
      p_table_name,
      p_constraint_name,
      p_check_sql
    );
  exception
    when duplicate_object then
      null;
  end;
end;
$$;

-- Profiles
select public._add_input_check_constraint('profiles', 'company_name', 'profiles_company_name_len', 'company_name is null or char_length(company_name) <= 120');
select public._add_input_check_constraint('profiles', 'owner_name', 'profiles_owner_name_len', 'owner_name is null or char_length(owner_name) <= 120');
select public._add_input_check_constraint('profiles', 'trade', 'profiles_trade_len', 'trade is null or char_length(trade) <= 240');
select public._add_input_check_constraint('profiles', 'phone', 'profiles_phone_shape', 'phone is null or (char_length(phone) <= 40 and phone ~ ''^[0-9()+. -]{7,40}$'')');
select public._add_input_check_constraint('profiles', 'website', 'profiles_website_shape', 'website is null or (char_length(website) <= 2048 and website ~* ''^https?://'')');
select public._add_input_check_constraint('profiles', 'service_area', 'profiles_service_area_len', 'service_area is null or char_length(service_area) <= 120');
select public._add_input_check_constraint('profiles', 'request_slug', 'profiles_request_slug_shape', 'char_length(request_slug) <= 120 and request_slug ~ ''^[a-z0-9][a-z0-9_-]{0,119}$''');

-- Clients
select public._add_input_check_constraint('clients', 'name', 'clients_name_len', 'char_length(name) <= 120');
select public._add_input_check_constraint('clients', 'company', 'clients_company_len', 'char_length(company) <= 120');
select public._add_input_check_constraint('clients', 'trade', 'clients_trade_len', 'trade is null or char_length(trade) <= 240');
select public._add_input_check_constraint('clients', 'email', 'clients_email_shape', 'email is null or (char_length(email) <= 254 and email ~* ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'')');
select public._add_input_check_constraint('clients', 'phone', 'clients_phone_shape', 'phone is null or (char_length(phone) <= 40 and phone ~ ''^[0-9()+. -]{7,40}$'')');
select public._add_input_check_constraint('clients', 'notes', 'clients_notes_len', 'notes is null or char_length(notes) <= 1000');
select public._add_input_check_constraint('clients', 'total_billed', 'clients_total_billed_range', 'total_billed is null or (total_billed >= 0 and total_billed <= 10000000)');
select public._add_input_check_constraint('clients', 'unpaid_balance', 'clients_unpaid_balance_range', 'unpaid_balance is null or (unpaid_balance >= 0 and unpaid_balance <= 10000000)');
select public._add_input_check_constraint('clients', 'overdue_invoice_count', 'clients_overdue_invoice_count_range', 'overdue_invoice_count is null or (overdue_invoice_count >= 0 and overdue_invoice_count <= 10000)');

-- Job requests
select public._add_input_check_constraint('job_requests', 'client_name', 'job_requests_client_name_len', 'client_name is null or char_length(client_name) <= 120');
select public._add_input_check_constraint('job_requests', 'client_email', 'job_requests_client_email_shape', 'client_email is null or (char_length(client_email) <= 254 and client_email ~* ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'')');
select public._add_input_check_constraint('job_requests', 'client_phone', 'job_requests_client_phone_shape', 'client_phone is null or (char_length(client_phone) <= 40 and client_phone ~ ''^[0-9()+. -]{7,40}$'')');
select public._add_input_check_constraint('job_requests', 'title', 'job_requests_title_len', 'char_length(title) <= 120');
select public._add_input_check_constraint('job_requests', 'description', 'job_requests_description_len', 'char_length(description) <= 4000');
select public._add_input_check_constraint('job_requests', 'address_street', 'job_requests_address_street_len', 'address_street is null or char_length(address_street) <= 240');
select public._add_input_check_constraint('job_requests', 'work_address', 'job_requests_work_address_len', 'work_address is null or char_length(work_address) <= 240');
select public._add_input_check_constraint('job_requests', 'scheduled_visit_notes', 'job_requests_scheduled_visit_notes_len', 'scheduled_visit_notes is null or char_length(scheduled_visit_notes) <= 1000');
select public._add_input_check_constraint('job_requests', 'trade', 'job_requests_trade_len', 'trade is null or char_length(trade) <= 240');
select public._add_input_check_constraint('job_requests', 'service_area', 'job_requests_service_area_len', 'char_length(service_area) <= 120');
select public._add_input_check_constraint('job_requests', 'budget_min', 'job_requests_budget_min_range', 'budget_min is null or (budget_min >= 0 and budget_min <= 10000000)');
select public._add_input_check_constraint('job_requests', 'budget_max', 'job_requests_budget_max_range', 'budget_max is null or (budget_max >= 0 and budget_max <= 10000000)');
select public._add_input_check_constraint('job_requests', 'contact_preference', 'job_requests_contact_preference_len', 'char_length(contact_preference) <= 40');
select public._add_input_check_constraint('job_requests', 'photo_notes', 'job_requests_photo_notes_len', 'photo_notes is null or char_length(photo_notes) <= 1000');
select public._add_input_check_constraint('job_requests', 'photo_urls', 'job_requests_photo_urls_count', 'cardinality(photo_urls) <= 10');
select public._add_input_check_constraint('job_requests', 'more_details_message', 'job_requests_more_details_message_len', 'more_details_message is null or char_length(more_details_message) <= 4000');
select public._add_input_check_constraint('job_requests', 'more_details_response', 'job_requests_more_details_response_len', 'more_details_response is null or char_length(more_details_response) <= 4000');
select public._add_input_check_constraint('job_requests', 'visit_client_notes', 'job_requests_visit_client_notes_len', 'visit_client_notes is null or char_length(visit_client_notes) <= 1000');
select public._add_input_check_constraint('job_requests', 'contractor_decline_reason', 'job_requests_contractor_decline_reason_len', 'contractor_decline_reason is null or char_length(contractor_decline_reason) <= 1000');

-- Estimates
select public._add_input_check_constraint('estimates', 'client_name', 'estimates_client_name_len', 'client_name is null or char_length(client_name) <= 120');
select public._add_input_check_constraint('estimates', 'work_address', 'estimates_work_address_len', 'work_address is null or char_length(work_address) <= 240');
select public._add_input_check_constraint('estimates', 'estimate_number', 'estimates_estimate_number_len', 'char_length(estimate_number) <= 40');
select public._add_input_check_constraint('estimates', 'amount', 'estimates_amount_range', 'amount >= 0 and amount <= 10000000');
select public._add_input_check_constraint('estimates', 'scheduled_visit_notes', 'estimates_scheduled_visit_notes_len', 'scheduled_visit_notes is null or char_length(scheduled_visit_notes) <= 1000');
select public._add_input_check_constraint('estimates', 'billing_type', 'estimates_billing_type_len', 'billing_type is null or char_length(billing_type) <= 40');
select public._add_input_check_constraint('estimates', 'decline_reason', 'estimates_decline_reason_len', 'decline_reason is null or char_length(decline_reason) <= 160');
select public._add_input_check_constraint('estimates', 'decline_comment', 'estimates_decline_comment_len', 'decline_comment is null or char_length(decline_comment) <= 1000');
select public._add_input_check_constraint('estimates', 'notes', 'estimates_notes_len', 'notes is null or char_length(notes) <= 4000');
select public._add_input_check_constraint('estimates', 'line_items', 'estimates_line_items_shape', 'jsonb_typeof(line_items) = ''array'' and jsonb_array_length(line_items) <= 100');
select public._add_input_check_constraint('estimates', 'tax_rate', 'estimates_tax_rate_range', 'tax_rate >= 0 and tax_rate <= 100');
select public._add_input_check_constraint('estimates', 'tax_lines', 'estimates_tax_lines_shape', 'jsonb_typeof(tax_lines) = ''array'' and jsonb_array_length(tax_lines) <= 20');
select public._add_input_check_constraint('estimates', 'contractor_amount_cents', 'estimates_contractor_amount_cents_range', 'contractor_amount_cents is null or (contractor_amount_cents >= 0 and contractor_amount_cents <= 1000000000)');
select public._add_input_check_constraint('estimates', 'platform_fee_cents', 'estimates_platform_fee_cents_range', 'platform_fee_cents is null or (platform_fee_cents >= 0 and platform_fee_cents <= 1000000000)');
select public._add_input_check_constraint('estimates', 'client_total_cents', 'estimates_client_total_cents_range', 'client_total_cents is null or (client_total_cents >= 0 and client_total_cents <= 1000000000)');
select public._add_input_check_constraint('estimates', 'gst_cents', 'estimates_gst_cents_range', 'gst_cents is null or (gst_cents >= 0 and gst_cents <= 1000000000)');
select public._add_input_check_constraint('estimates', 'deposit_amount_cents', 'estimates_deposit_amount_cents_range', 'deposit_amount_cents is null or (deposit_amount_cents >= 0 and deposit_amount_cents <= 1000000000)');
select public._add_input_check_constraint('estimates', 'deposit_percentage', 'estimates_deposit_percentage_range', 'deposit_percentage is null or (deposit_percentage >= 0 and deposit_percentage <= 100)');

-- Invoices
select public._add_input_check_constraint('invoices', 'client_name', 'invoices_client_name_len', 'client_name is null or char_length(client_name) <= 120');
select public._add_input_check_constraint('invoices', 'invoice_number', 'invoices_invoice_number_len', 'char_length(invoice_number) <= 40');
select public._add_input_check_constraint('invoices', 'project_name', 'invoices_project_name_len', 'project_name is null or char_length(project_name) <= 160');
select public._add_input_check_constraint('invoices', 'work_address', 'invoices_work_address_len', 'work_address is null or char_length(work_address) <= 240');
select public._add_input_check_constraint('invoices', 'scheduled_visit_notes', 'invoices_scheduled_visit_notes_len', 'scheduled_visit_notes is null or char_length(scheduled_visit_notes) <= 1000');
select public._add_input_check_constraint('invoices', 'amount', 'invoices_amount_range', 'amount >= 0 and amount <= 10000000');
select public._add_input_check_constraint('invoices', 'trade', 'invoices_trade_len', 'trade is null or char_length(trade) <= 240');
select public._add_input_check_constraint('invoices', 'notes', 'invoices_notes_len', 'notes is null or char_length(notes) <= 1000');
select public._add_input_check_constraint('invoices', 'line_items', 'invoices_line_items_shape', 'jsonb_typeof(line_items) = ''array'' and jsonb_array_length(line_items) <= 100');
select public._add_input_check_constraint('invoices', 'tax_rate', 'invoices_tax_rate_range', 'tax_rate >= 0 and tax_rate <= 100');
select public._add_input_check_constraint('invoices', 'tax_lines', 'invoices_tax_lines_shape', 'jsonb_typeof(tax_lines) = ''array'' and jsonb_array_length(tax_lines) <= 20');

-- Recovery and email workflows
select public._add_input_check_constraint('recovery_items', 'client_name', 'recovery_items_client_name_len', 'char_length(client_name) <= 120');
select public._add_input_check_constraint('recovery_items', 'client_email', 'recovery_items_client_email_shape', 'client_email is null or (char_length(client_email) <= 254 and client_email ~* ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'')');
select public._add_input_check_constraint('recovery_items', 'client_phone', 'recovery_items_client_phone_shape', 'client_phone is null or (char_length(client_phone) <= 40 and client_phone ~ ''^[0-9()+. -]{7,40}$'')');
select public._add_input_check_constraint('recovery_items', 'amount', 'recovery_items_amount_range', 'amount >= 0 and amount <= 10000000');
select public._add_input_check_constraint('recovery_items', 'message_body', 'recovery_items_message_body_len', 'message_body is null or char_length(message_body) <= 5000');
select public._add_input_check_constraint('recovery_items', 'notes', 'recovery_items_notes_len', 'notes is null or char_length(notes) <= 1000');
select public._add_input_check_constraint('recovery_items', 'follow_up_count', 'recovery_items_follow_up_count_range', 'follow_up_count >= 0 and follow_up_count <= 1000');

select public._add_input_check_constraint('reminders', 'reminder_type', 'reminders_reminder_type_len', 'char_length(reminder_type) <= 160');
select public._add_input_check_constraint('reminders', 'contact_method', 'reminders_contact_method_len', 'char_length(contact_method) <= 40');
select public._add_input_check_constraint('reminders', 'status', 'reminders_status_len', 'char_length(status) <= 40');
select public._add_input_check_constraint('reminders', 'notes', 'reminders_notes_len', 'notes is null or char_length(notes) <= 1000');

select public._add_input_check_constraint('contractor_reviews', 'comment', 'contractor_reviews_comment_len', 'comment is null or char_length(comment) <= 1000');

select public._add_input_check_constraint('recovery_email_events', 'to_email', 'recovery_email_events_to_email_shape', 'char_length(to_email) <= 254 and to_email ~* ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$''');
select public._add_input_check_constraint('recovery_email_events', 'subject', 'recovery_email_events_subject_len', 'char_length(subject) <= 160');
select public._add_input_check_constraint('recovery_email_events', 'body', 'recovery_email_events_body_len', 'char_length(body) <= 5000');
select public._add_input_check_constraint('recovery_email_events', 'provider', 'recovery_email_events_provider_len', 'char_length(provider) <= 80');
select public._add_input_check_constraint('recovery_email_events', 'provider_message_id', 'recovery_email_events_provider_message_id_len', 'provider_message_id is null or char_length(provider_message_id) <= 240');
select public._add_input_check_constraint('recovery_email_events', 'error_message', 'recovery_email_events_error_message_len', 'error_message is null or char_length(error_message) <= 1000');
select public._add_input_check_constraint('recovery_email_events', 'reply_to_email', 'recovery_email_events_reply_to_email_shape', 'reply_to_email is null or (char_length(reply_to_email) <= 254 and reply_to_email ~* ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'')');

select public._add_input_check_constraint('recovery_email_replies', 'from_email', 'recovery_email_replies_from_email_shape', 'char_length(from_email) <= 254 and from_email ~* ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$''');
select public._add_input_check_constraint('recovery_email_replies', 'from_name', 'recovery_email_replies_from_name_len', 'from_name is null or char_length(from_name) <= 120');
select public._add_input_check_constraint('recovery_email_replies', 'to_email', 'recovery_email_replies_to_email_shape', 'char_length(to_email) <= 254 and to_email ~* ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$''');
select public._add_input_check_constraint('recovery_email_replies', 'subject', 'recovery_email_replies_subject_len', 'subject is null or char_length(subject) <= 160');
select public._add_input_check_constraint('recovery_email_replies', 'text_body', 'recovery_email_replies_text_body_len', 'text_body is null or char_length(text_body) <= 5000');
select public._add_input_check_constraint('recovery_email_replies', 'html_body', 'recovery_email_replies_html_body_len', 'html_body is null or char_length(html_body) <= 10000');
select public._add_input_check_constraint('recovery_email_replies', 'provider', 'recovery_email_replies_provider_len', 'char_length(provider) <= 80');
select public._add_input_check_constraint('recovery_email_replies', 'provider_email_id', 'recovery_email_replies_provider_email_id_len', 'provider_email_id is null or char_length(provider_email_id) <= 240');

-- Settings
select public._add_input_check_constraint('settings', 'default_payment_terms', 'settings_default_payment_terms_range', 'default_payment_terms between 1 and 365');
select public._add_input_check_constraint('settings', 'late_fee_percentage', 'settings_late_fee_percentage_range', 'late_fee_percentage between 0 and 100');
select public._add_input_check_constraint('settings', 'currency', 'settings_currency_allowed', 'currency in (''CAD'', ''USD'')');
select public._add_input_check_constraint('settings', 'first_reminder_days', 'settings_first_reminder_days_range', 'first_reminder_days between 1 and 365');
select public._add_input_check_constraint('settings', 'second_reminder_days', 'settings_second_reminder_days_range', 'second_reminder_days between 1 and 365');
select public._add_input_check_constraint('settings', 'final_notice_days', 'settings_final_notice_days_range', 'final_notice_days between 1 and 365');
select public._add_input_check_constraint('settings', 'default_tone', 'settings_default_tone_allowed', 'default_tone in (''friendly'', ''professional'', ''firm'')');

drop function public._add_input_check_constraint(text, text, text, text);
