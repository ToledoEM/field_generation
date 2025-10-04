library(tidyverse)
library(wesanderson) #pretty colours

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


