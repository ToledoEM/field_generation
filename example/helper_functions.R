library(tidyverse)
library(rlang)
library(slider)

# This function identifies and filters points that are part of semi-static
# segments (wiggles) within the same path, based on movement thresholds.

filter_wiggles <- function(data, min_steps_in_wiggle = 5, pixel_tolerance = 1) {
  
  if (min_steps_in_wiggle < 1) {
    stop("min_steps_in_wiggle must be 1 or greater.")
  }
  
  steps <- 0:min_steps_in_wiggle
  
  lead_conditions <- paste0(
    "lead(is_small_step, n = ", steps[-1], ")",
    collapse = " & "
  )
  lag_conditions <- paste0(
    "lag(is_wiggle_start, n = ", steps, ")",
    collapse = " | "
  )
  
  data %>%
    group_by(path_id) %>%
    
    mutate(
      is_small_step = (
        abs(x - lead(x, n = 1)) <= pixel_tolerance &
          abs(y - lead(y, n = 1)) <= pixel_tolerance
      )
    ) %>%
    
    mutate(
      is_wiggle_start = is_small_step & !!rlang::parse_expr(lead_conditions)
    ) %>%
    
    mutate(
      is_wiggle_point = !!rlang::parse_expr(lag_conditions)
    ) %>%
    
    filter(!is.na(is_wiggle_point) & is_wiggle_point) %>%
    select(path_id, point_index, x, y) %>%
    ungroup()
}


# This function calculates a centered rolling average for the x and y coordinates
# within each path, where the window size is an adjustable argument.

add_rolling_average <- function(data, window_size = 5) {
  
  if (window_size < 1 | window_size %% 2 == 0) {
    stop("window_size must be a positive odd integer.")
  }
  
  data %>%
    group_by(path_id) %>%
    mutate(
      x_roll_avg = slide_dbl(
        .x = x,
        .f = mean,
        .before = floor(window_size / 2),
        .after = floor(window_size / 2),
        .complete = FALSE,
        .na_rm = TRUE
      ),
      y_roll_avg = slide_dbl(
        .x = y,
        .f = mean,
        .before = floor(window_size / 2),
        .after = floor(window_size / 2),
        .complete = FALSE,
        .na_rm = TRUE
      )
    ) %>%
    ungroup()
}