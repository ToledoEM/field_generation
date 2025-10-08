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


#####
# Load data an create a color vector
plotter <- read_csv("example_2/plotter_flow_field.csv")
pal <- wes_palette(4, name = "Chevalier1", type = "continuous")


# Reproduce view of processing page
plotter %>% ggplot(aes(x,y,group = path_id)) +
  geom_path() + theme_void() + 
  coord_fixed()


plotter %>% 
  group_by(path_id) %>% 
  mutate(color=sample(pal,1)) %>% 
  ungroup() %>% 
  ggplot(aes(x,y,group = path_id)) +
  geom_path(aes(color=color),show.legend = F) +
  theme_void()+
  theme(
    # Set the entire plot background to black
    plot.background = element_rect(fill = "black", color = NA),
    # Set the panel (plotting area) background to black
    panel.background = element_rect(fill = "black", color = NA),
    # Change grid lines to a lighter color
    panel.grid.major = element_line(color = "black", linewidth = 0.5),
    panel.grid.minor = element_line(color = "black", linewidth = 0.25),
    legend.background = element_rect(fill = "black", color = NA),
    legend.key = element_rect(fill = "black", color = NA) # Background of color keys
  ) + scale_color_identity() + 
  coord_fixed()

ggsave(filename = "example_2/plotter_flow_field_colors.png",width = 8,height = 8,units = "in")

# Faceted panel plot by color (no legend)
plotter %>% 
  group_by(path_id) %>% 
  mutate(color=sample(pal,1)) %>% 
  ungroup() %>% 
  ggplot(aes(x,y,group = path_id)) +
  geom_path(aes(color=color),show.legend = F) +
  theme_void() +
  scale_color_identity() + facet_wrap(~color) +
  theme(  plot.background = element_rect(fill = "black", color = NA),
    panel.background = element_rect(fill = "black", color = NA),
    panel.grid.major = element_line(color = "black", linewidth = 0.5),
    panel.grid.minor = element_line(color = "black", linewidth = 0.25),
    legend.background = element_rect(fill = "black", color = NA),
    legend.key = element_rect(fill = "black", color = NA),
    strip.background = element_blank(),
    strip.text.x = element_blank()  )



ggsave(filename = "example_2/plotter_flow_field_colors_panel.png",width = 8,height = 8,units = "in")
