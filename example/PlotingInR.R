library(tidyverse)
source("helper_functions.R")
library(wesanderson) #pretty colours
library(MetBrewer)

# Load data an create a color vector
plotter <- read_csv("plotter_flow_field.csv")
pal <- wes_palette(9, name = "Zissou1", type = "continuous")


# Reproduce view of processing page
plotter %>% ggplot(aes(x,y,group = path_id)) +
  geom_path() + theme_void() + 
  coord_fixed()


# Assign unique colors per path and generate base plot
plotter %>% 
  group_by(path_id) %>% 
  mutate(color=sample(pal,1)) %>% 
  ungroup() %>% 
  ggplot(aes(x,y,group = path_id)) +
  geom_path(aes(color=color),show.legend = F) +
  theme_void() +
  scale_color_identity() + 
  coord_fixed()
  
ggsave(filename = "plotter_flow_field_colors.png",width = 8,height = 8,units = "in")

# Faceted panel plot by color (no legend)
plotter %>% 
  group_by(path_id) %>% 
  mutate(color=sample(pal,1)) %>% 
  ungroup() %>% 
  ggplot(aes(x,y,group = path_id)) +
  geom_path(aes(color=color),show.legend = F) +
  theme_void() +
  scale_color_identity() + facet_wrap(~color) +
  theme(
    strip.background = element_blank(),
    strip.text.x = element_blank()
  )
ggsave(filename = "plotter_flow_field_colors_panel.png",width = 8,height = 8,units = "in")



# Load data an create a color vector
plotter <- read_csv("plotter_flow_field_v2.csv")
pal <- wes_palette(10, name = "Zissou1", type = "continuous")


plotter %>% 
  group_by(path_id) %>% 
  mutate(color=sample(pal,1)) %>% 
  ungroup() %>% 
  ggplot(aes(x,y,group = path_id)) +
  geom_path(aes(color=color),show.legend = F,linewidth=0.3) +
  theme_void() +
  scale_color_identity() + 
  coord_fixed()


plotter %>% 
  ggplot(aes(x,y,group = point_index)) +
  geom_path(aes(),show.legend = F,linewidth = 0.5,alpha=0.2) +
  theme_void() +
  scale_color_identity() 



#####

# Load data an create a color vector
plotter <- read_csv("plotter_flow_field_big.csv")
pal <- met.brewer(50, name = "Derain", type = "continuous")


# Assign unique colors per path and generate base plot
plotter %>% 
  group_by(path_id) %>% 
  mutate(color=sample(pal,1)) %>% 
  ungroup() %>% 
  ggplot(aes(x,y,group = path_id)) +
  geom_path(aes(color=color),show.legend = F,linewidth = 0.25,lineend = "round",linejoin = "round") +
  theme_void() +
  scale_color_identity() + 
  coord_fixed()

ggsave(filename = "plotter_flow_field_colors_big.png")



filtered_plotter <- filter_wiggles(data = plotter,min_steps_in_wiggle = 2,pixel_tolerance = 1)


filtered_plotter %>% 
group_by(path_id) %>% 
  mutate(color=sample(pal,1)) %>% 
  ungroup() %>% 
  ggplot(aes(x,y,group = path_id)) +
  geom_path(aes(color=color),show.legend = F,linewidth = 0.25,lineend = "round",linejoin = "round") +
  theme_void() +
  scale_color_identity() + 
  coord_fixed()


plotter <- add_rolling_average(plotter,window_size = 7)


plotter %>% 
  group_by(path_id) %>% 
  mutate(color=sample(pal,1)) %>% 
  ungroup() %>% 
  ggplot(aes(x_roll_avg,y_roll_avg,group = path_id)) +
  geom_path(aes(color=color),show.legend = F,linewidth = 0.25,lineend = "round",linejoin = "round") +
  theme_void() +
  scale_color_identity() + 
  coord_fixed()
ggsave(filename = "plotter_flow_field_colors_big.png")
ggsave(filename = "plotter_flow_field_colors_big.svg")

####\\\\\\\
plotter <- read_csv("example_202602/plotter_flow_field_2.csv")

pal <- wes_palette(9, name = "Zissou1", type = "continuous")


# Reproduce view of processing page
plotter %>% ggplot(aes(x,y,group = path_id)) +
  geom_path() + theme_void() + 
  coord_fixed()


# Assign unique colors per path and generate base plot
plotter %>% 
  group_by(path_id) %>% 
  mutate(color=sample(pal,1)) %>% 
  ungroup() %>% 
  ggplot(aes(x,y,group = path_id)) +
  geom_path(aes(color=color),show.legend = F,linewidth = 0.3) +
  theme_void() +
  scale_color_identity() + 
  coord_polar(clip = "on",start = 1)
